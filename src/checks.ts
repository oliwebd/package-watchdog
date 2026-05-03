import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import { spawnRead, DistroInfo } from './utils.js';

let Soup: any = null;
let soupSession: any = null;
let _cancellable: any = null;

async function _initSoup() {
    if (Soup) return;
    try {
        const { default: S } = await import('gi://Soup?version=3.0');
        Soup = S;
        soupSession = new Soup.Session();
        soupSession.timeout = 30; // abort hung requests after 30 s
        _cancellable = new Gio.Cancellable();
    } catch (_e) {
        /* Soup unavailable — OSV scans will be silently skipped */
    }
}

/** Cancel any in-flight OSV requests and release Soup resources. */
export function cleanupChecks() {
    _cancellable?.cancel();
    _cancellable = null;
    soupSession = null;
    Soup = null;
}

/**
 * Maps a DistroInfo to an OSV-supported ecosystem string.
 * Exported so it can be used from both extension.ts and prefs.ts without
 * needing a dynamic import.
 */
export function getOsvEcosystem(distro: DistroInfo): string {
    const { family, versionId: v } = distro;
    if (family === 'fedora') return v ? `Fedora:${v}` : 'Fedora';
    // Ubuntu must come before debian: ID_LIKE=debian would otherwise match.
    if (family === 'ubuntu') return v ? `Ubuntu:${v}` : 'Ubuntu';
    if (family === 'debian') return v ? `Debian:${v}` : 'Debian';
    if (family === 'opensuse') return 'openSUSE';
    return '';
}

// ── System package manager checks ────────────────────────────────────────────

export async function checkDnf(): Promise<string[]> {
    try {
        const { stdout, exitCode } = await spawnRead([
            'dnf',
            'check-update',
            '--quiet',
            '--refresh',
        ]);
        const lines = stdout.split('\n').filter((l: string) => {
            const t = l.trim();
            return (
                t.length > 0 &&
                !t.toLowerCase().startsWith('last metadata') &&
                !t.toLowerCase().startsWith('updating and loading')
            );
        });
        if (exitCode === 100 || lines.length > 0) {
            return lines.map((l: string) => l.trim().split(/\s+/)[0]).filter(Boolean);
        }
        return [];
    } catch (_e) {
        return [];
    }
}

export async function checkApt(): Promise<string[]> {
    try {
        const { stdout } = await spawnRead(['apt', 'list', '--upgradable', '--quiet=2']);
        return stdout
            .split('\n')
            .filter((l: string) => l.trim().length > 0 && l.includes('/'))
            .map((l: string) => l.split('/')[0]);
    } catch (_e) {
        return [];
    }
}

export async function checkZypper(): Promise<string[]> {
    try {
        const { stdout } = await spawnRead([
            'zypper',
            '--non-interactive',
            '--quiet',
            'list-updates',
        ]);
        return stdout
            .split('\n')
            .filter((l: string) => l.startsWith('v |'))
            .map((l: string) => l.split('|')[2]?.trim() ?? '')
            .filter(Boolean);
    } catch (_e) {
        return [];
    }
}

export interface FlatpakUpdateResult {
    apps: string[];
    runtimes: string[];
    total: number;
}

export async function checkFlatpak(): Promise<FlatpakUpdateResult> {
    try {
        const { stdout: listOut } = await spawnRead([
            'flatpak',
            'list',
            '--columns=application,active,options',
        ]);

        // Build a map: appId → [active-commit, alt-id-commit?]
        const installed = new Map<string, string[]>();
        listOut
            .trim()
            .split('\n')
            .filter(Boolean)
            .forEach((line: string) => {
                const parts = line.split(/\s+/);
                if (parts.length < 2) return;
                const [app, active, opts = ''] = parts;
                const hashes = [active];
                const altMatch = opts.match(/alt-id=([0-9a-f]+)/);
                if (altMatch) hashes.push(altMatch[1]);
                installed.set(app, hashes);
            });

        const parseLines = (stdout: string): string[] => {
            const validUpdates: string[] = [];
            for (const line of stdout.trim().split('\n').filter(Boolean)) {
                if (line.startsWith('Application ID')) continue;
                const parts = line.split(/\s+/);
                const app = parts[0];
                if (!app) continue;
                if (parts.length < 2) {
                    validUpdates.push(app);
                    continue;
                }
                const remoteCommit = parts[1];
                const localHashes = installed.get(app);
                if (localHashes?.some((h) => h.startsWith(remoteCommit))) continue;
                validUpdates.push(app);
            }
            return validUpdates;
        };

        const [appResult, runtimeResult] = await Promise.all([
            spawnRead([
                'flatpak',
                'remote-ls',
                '--updates',
                '--app',
                '--columns=application,commit:f',
            ]),
            spawnRead([
                'flatpak',
                'remote-ls',
                '--updates',
                '--runtime',
                '--columns=application,commit:f',
            ]),
        ]);

        const apps = parseLines(appResult.stdout);
        const runtimes = parseLines(runtimeResult.stdout);
        return { apps, runtimes, total: apps.length + runtimes.length };
    } catch (_e) {
        return { apps: [], runtimes: [], total: 0 };
    }
}

// ── Package info structs ──────────────────────────────────────────────────────

export interface PkgInfo {
    name: string;
    version: string;
    commit?: string;
    ecosystem?: string;
}

export async function getInstalledPackages(
    manager: string,
    monitoredPaths?: string,
): Promise<PkgInfo[]> {
    try {
        let argv: string[] = [];
        let parse: (stdout: string) => PkgInfo[] = () => [];

        if (manager === 'dnf' || manager === 'zypper') {
            argv = ['rpm', '-qa', '--qf', '%{NAME} %{VERSION} %{RELEASE}\n'];
            parse = (stdout) =>
                stdout
                    .trim()
                    .split('\n')
                    .filter(Boolean)
                    .map((l) => {
                        const parts = l.split(' ');
                        const name = parts[0];
                        const version = parts[1];
                        const release = parts[2] ?? '';
                        const gitMatch = `${version}-${release}`.match(
                            /(?:git|gp|g)([0-9a-f]{7,40})/i,
                        );
                        return {
                            name,
                            version: `${version}-${release}`,
                            commit: gitMatch ? gitMatch[1] : undefined,
                        };
                    });
        } else if (manager === 'apt') {
            argv = ['dpkg-query', '-W', '-f=${Package} ${Version}\\n'];
            parse = (stdout) =>
                stdout
                    .trim()
                    .split('\n')
                    .filter(Boolean)
                    .map((l) => {
                        const parts = l.split(' ');
                        return { name: parts[0], version: parts[1] };
                    });
        }

        if (argv.length === 0) return [];
        const { stdout } = await spawnRead(argv);
        let pkgs = parse(stdout);

        if (monitoredPaths) {
            pkgs = await _resolveLocalCommits(pkgs, monitoredPaths);
        }

        return pkgs;
    } catch (_e) {
        return [];
    }
}

export async function getFlatpakPkgInfo(monitoredPaths?: string): Promise<PkgInfo[]> {
    try {
        const { stdout } = await spawnRead([
            'flatpak',
            'list',
            '--columns=application,version,active,options',
        ]);
        const results: PkgInfo[] = [];

        for (const line of stdout.trim().split('\n').filter(Boolean)) {
            const parts = line.split(/\s+/);
            if (parts.length < 3) continue;
            const name = parts[0];
            const version = parts[1] === '--' ? '' : parts[1];
            let commit = parts[2];
            const options = parts[3] ?? '';

            if (commit.length !== 40 && options.includes('alt-id=')) {
                const altMatch = options.match(/alt-id=([0-9a-f]{40})/);
                if (altMatch) commit = altMatch[1];
            }

            results.push({ name, version, commit: commit.length >= 7 ? commit : undefined });
        }

        return monitoredPaths ? _resolveLocalCommits(results, monitoredPaths) : results;
    } catch (_e) {
        return [];
    }
}

/** Resolve short/missing commits by matching against local git repos. */
async function _resolveLocalCommits(pkgs: PkgInfo[], pathsStr: string): Promise<PkgInfo[]> {
    if (!pathsStr) return pkgs;
    const localRepos = await getLocalGitRepoCommits(pathsStr);
    const repoMap = new Map<string, string>();
    for (const repo of localRepos) {
        repoMap.set(repo.name.replace('local:', '').toLowerCase(), repo.commit ?? '');
    }

    return pkgs.map((pkg) => {
        const shortName = pkg.name.split('.').pop()?.toLowerCase() ?? '';
        const localCommit = repoMap.get(pkg.name.toLowerCase()) ?? repoMap.get(shortName);
        if (localCommit && (!pkg.commit || pkg.commit.length < 40)) {
            return { ...pkg, commit: localCommit };
        }
        return pkg;
    });
}

export async function getLocalGitRepoCommits(pathsStr: string): Promise<PkgInfo[]> {
    if (!pathsStr) return [];
    const paths = pathsStr
        .split(',')
        .map((p: string) => p.trim())
        .filter(Boolean);
    const results: PkgInfo[] = [];

    for (const path of paths) {
        try {
            const { stdout } = await spawnRead([
                'find',
                path,
                '-maxdepth',
                '3',
                '-name',
                '.git',
                '-type',
                'd',
            ]);
            for (const gitDir of stdout.trim().split('\n').filter(Boolean)) {
                const repoPath = gitDir.replace(/\/\.git$/, '');
                const folderName = repoPath.split('/').pop() ?? 'unknown-repo';
                try {
                    const { stdout: commitOut } = await spawnRead([
                        'git',
                        '-C',
                        repoPath,
                        'rev-parse',
                        'HEAD',
                    ]);
                    const commit = commitOut.trim();
                    if (commit.length === 40) {
                        results.push({ name: `local:${folderName}`, version: 'git-repo', commit });
                    }
                } catch {
                    /* skip unreadable repos */
                }
            }
        } catch {
            /* skip unreadable paths */
        }
    }
    return results;
}

export async function getNpmPkgInfo(
    pathsStr: string,
    autoDiscover: boolean = false,
): Promise<PkgInfo[]> {
    const paths: string[] = autoDiscover
        ? await _autoDiscoverNpmProjects()
        : pathsStr
              .split(',')
              .map((p: string) => p.trim())
              .filter(Boolean);

    if (paths.length === 0) return [];
    const results: PkgInfo[] = [];

    for (const path of paths) {
        try {
            const { stdout } = await spawnRead([
                'find',
                path,
                '-maxdepth',
                '3',
                '-name',
                'package.json',
            ]);
            for (const jsonFile of stdout.trim().split('\n').filter(Boolean)) {
                if (jsonFile.includes('node_modules')) continue;
                try {
                    const file = Gio.File.new_for_path(jsonFile);
                    const [contents] = await file.load_contents_async(null);
                    if (!contents) continue;
                    const data = JSON.parse(new TextDecoder().decode(contents));
                    const deps = { ...data.dependencies, ...data.devDependencies };
                    for (const [name, ver] of Object.entries(deps)) {
                        const version = _extractNpmVersion(ver as string);
                        if (version) {
                            results.push({ name, version, ecosystem: 'npm' });
                        }
                    }
                } catch {
                    /* skip malformed package.json */
                }
            }
        } catch {
            /* skip unreadable paths */
        }
    }
    return results;
}

/**
 * Extract a clean semver string from an npm range specifier.
 * Rejects file:/ and workspace: references, strips leading ^ ~ >= etc.,
 * but preserves pre-release identifiers like "1.2.3-beta.1".
 */
function _extractNpmVersion(raw: string): string {
    if (!raw) return '';
    if (raw.startsWith('file:') || raw.startsWith('workspace:')) return '';
    const stripped = raw.replace(/^[^0-9]*/, '');
    return /^\d+\.\d+/.test(stripped) ? stripped : '';
}

async function _autoDiscoverNpmProjects(): Promise<string[]> {
    try {
        const home = GLib.get_home_dir();
        const { stdout } = await spawnRead([
            'find',
            home,
            '-maxdepth',
            '4',
            '-name',
            'package.json',
            '-not',
            '-path',
            '*/node_modules/*',
            '-not',
            '-path',
            '*/.*',
        ]);
        const files = stdout.trim().split('\n').filter(Boolean);
        const dirs = files.map((f: string) => f.substring(0, f.lastIndexOf('/')));
        return [...new Set(dirs)];
    } catch (_e) {
        return [];
    }
}

// ── OSV vulnerability scanning ────────────────────────────────────────────────

export async function checkOsv(
    packages: PkgInfo[],
    defaultEcosystem: string,
): Promise<{ id: string; pkgName: string }[]> {
    if (packages.length === 0) return [];
    await _initSoup();
    if (!Soup || !soupSession) return [];

    const vulnerabilities: { id: string; pkgName: string }[] = [];
    const seenIds = new Set<string>();
    const batchSize = 500;

    for (let i = 0; i < packages.length; i += batchSize) {
        const chunk = packages.slice(i, i + batchSize);
        const queries = chunk.map((pkg) => {
            if (pkg.commit?.length === 40) return { commit: pkg.commit };
            const ecosystem = pkg.ecosystem ?? defaultEcosystem;
            const query: any = { package: { name: pkg.name, ecosystem } };
            if (pkg.version) query.version = pkg.version;
            return query;
        });

        try {
            const message = Soup.Message.new('POST', 'https://api.osv.dev/v1/querybatch');
            const body = JSON.stringify({ queries });
            message.set_request_body_from_bytes(
                'application/json',
                new GLib.Bytes(new TextEncoder().encode(body)),
            );

            const bytes = await soupSession.send_and_read_async(
                message,
                GLib.PRIORITY_DEFAULT,
                _cancellable,
            );
            if (message.status_code !== 200) continue;

            const data = JSON.parse(new TextDecoder().decode(bytes.get_data()));
            if (!data.results) continue;

            data.results.forEach((res: any, idx: number) => {
                if (!res.vulns) return;
                const pkgName = chunk[idx].name;
                for (const v of res.vulns) {
                    const key = `${pkgName}:${v.id}`;
                    if (!seenIds.has(key)) {
                        vulnerabilities.push({ id: v.id, pkgName });
                        seenIds.add(key);
                    }
                }
            });
        } catch (_err) {
            /* skip failed batch — proceed with remaining */
        }
    }

    return vulnerabilities.sort((a, b) => a.pkgName.localeCompare(b.pkgName));
}
