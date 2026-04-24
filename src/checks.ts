import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import { spawnRead, DistroInfo } from './utils.js';

let Soup: any = null;
let soupSession: any = null;
let _cancellable: any = null;

async function _initSoup() {
    if (Soup) return;
    try {
        // @ts-ignore
        const { default: S } = await import('gi://Soup?version=3.0');
        Soup = S;
        soupSession = new Soup.Session();
        // B-3: set a per-request timeout so hung API calls don't lock the indicator
        soupSession.timeout = 30;
        _cancellable = new Gio.Cancellable();
    } catch (_e) {
        /* skip */
    }
}

export function cleanupChecks() {
    // B-3: cancel any in-flight OSV requests when the extension is disabled
    _cancellable?.cancel();
    _cancellable = null;
    soupSession = null;
    Soup = null;
}

/**
 * Maps the current distribution to an OSV-supported ecosystem string.
 */
export function getOsvEcosystem(distro: DistroInfo): string {
    const family = distro.family;
    const v = distro.versionId;

    if (family === 'fedora') return v ? `Fedora:${v}` : 'Fedora';
    // C-1: explicit ubuntu branch — must come before debian so Ubuntu users
    // are queried against Ubuntu Security Notices, not Debian advisories.
    if (family === 'ubuntu') return v ? `Ubuntu:${v}` : 'Ubuntu';
    if (family === 'debian') return v ? `Debian:${v}` : 'Debian';
    if (family === 'opensuse') return 'openSUSE';

    return '';
}

export async function checkDnf(): Promise<string[]> {
    try {
        const { stdout, exitCode } = await spawnRead([
            'dnf',
            'check-update',
            '--quiet',
            '--refresh',
        ]);
        const lines = stdout.split('\n').filter((l: string) => {
            const trimmed = l.trim();
            return (
                trimmed.length > 0 &&
                !trimmed.toLowerCase().startsWith('last metadata') &&
                !trimmed.toLowerCase().startsWith('updating and loading')
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
        const lines = stdout
            .split('\n')
            .filter((l: string) => l.trim().length > 0 && l.includes('/'))
            .map((l: string) => l.split('/')[0]);
        return lines;
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
        const lines = stdout
            .split('\n')
            .filter((l: string) => l.startsWith('v |'))
            .map((l: string) => {
                const parts = l.split('|');
                return parts[2]?.trim() || '';
            })
            .filter(Boolean);
        return lines;
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
        const parseLines = (stdout: string) =>
            stdout
                .split('\n')
                .map((l: string) => l.trim())
                .filter((l: string) => l.length > 0 && l !== 'Application ID');

        const [appResult, runtimeResult] = await Promise.all([
            spawnRead(['flatpak', 'remote-ls', '--updates', '--app', '--columns=application']),
            spawnRead(['flatpak', 'remote-ls', '--updates', '--runtime', '--columns=application']),
        ]);

        const apps = parseLines(appResult.stdout);
        const runtimes = parseLines(runtimeResult.stdout);
        return { apps, runtimes, total: apps.length + runtimes.length };
    } catch (_e) {
        return { apps: [], runtimes: [], total: 0 };
    }
}

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
                        const release = parts[2] || '';

                        const gitMatch = (version + '-' + release).match(
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
            pkgs = await resolveLocalCommits(pkgs, monitoredPaths);
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
        const lines = stdout.trim().split('\n').filter(Boolean);
        const results: PkgInfo[] = [];
        for (const line of lines) {
            const parts = line.split(/\s+/);
            if (parts.length < 3) continue;

            const name = parts[0];
            const version = parts[1] === '--' ? '' : parts[1];
            let commit = parts[2];
            const options = parts[3] || '';

            if (commit.length !== 40 && options.includes('alt-id=')) {
                const altMatch = options.match(/alt-id=([0-9a-f]{40})/);
                if (altMatch) commit = altMatch[1];
            }

            results.push({ name, version, commit: commit.length >= 7 ? commit : undefined });
        }

        if (monitoredPaths) {
            return await resolveLocalCommits(results, monitoredPaths);
        }

        return results;
    } catch (_e) {
        return [];
    }
}

/**
 * Resolves short hashes or missing commits by checking local git repositories
 */
async function resolveLocalCommits(pkgs: PkgInfo[], pathsStr: string): Promise<PkgInfo[]> {
    if (!pathsStr) return pkgs;
    const localRepos = await getLocalGitRepoCommits(pathsStr);
    const repoMap = new Map();
    for (const repo of localRepos) {
        repoMap.set(repo.name.replace('local:', '').toLowerCase(), repo.commit);
    }

    return pkgs.map((pkg) => {
        const pkgShortName = pkg.name.split('.').pop()?.toLowerCase() || '';
        const localCommit = repoMap.get(pkg.name.toLowerCase()) || repoMap.get(pkgShortName);

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
            const gitDirs = stdout.trim().split('\n').filter(Boolean);
            for (const gitDir of gitDirs) {
                const repoPath = gitDir.replace(/\/\.git$/, '');
                const folderName = repoPath.split('/').pop() || 'unknown-repo';
                try {
                    const commitResult = await spawnRead([
                        'git',
                        '-C',
                        repoPath,
                        'rev-parse',
                        'HEAD',
                    ]);
                    const commit = commitResult.stdout.trim();
                    if (commit && commit.length === 40) {
                        results.push({ name: `local:${folderName}`, version: 'git-repo', commit });
                    }
                } catch {
                    /* skip */
                }
            }
        } catch {
            /* skip */
        }
    }
    return results;
}

export async function getNpmPkgInfo(
    pathsStr: string,
    autoDiscover: boolean = false,
): Promise<PkgInfo[]> {
    let paths: string[] = [];
    if (autoDiscover) {
        paths = await autoDiscoverNpmProjects();
    } else if (pathsStr) {
        paths = pathsStr
            .split(',')
            .map((p: string) => p.trim())
            .filter(Boolean);
    }

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
            const jsonFiles = stdout.trim().split('\n').filter(Boolean);
            for (const jsonFile of jsonFiles) {
                if (jsonFile.includes('node_modules')) continue;
                try {
                    const file = Gio.File.new_for_path(jsonFile);
                    const [contents] = await file.load_contents_async(null);
                    if (!contents) continue;

                    const data = JSON.parse(new TextDecoder().decode(contents));
                    const deps = { ...data.dependencies, ...data.devDependencies };
                    for (const [name, ver] of Object.entries(deps)) {
                        // B-1 + B-2: preserve pre-release identifiers; reject file:/workspace: refs
                        const version = extractNpmVersion(ver as string);
                        if (version) {
                            results.push({ name: name as string, version, ecosystem: 'npm' });
                        }
                    }
                } catch {
                    /* skip */
                }
            }
        } catch {
            /* skip */
        }
    }
    return results;
}

/**
 * B-1 + B-2: Extracts a clean version string from an npm semver range specifier.
 *
 * - Rejects local file paths ("file:../lib") and workspace references
 *   ("workspace:^1.0.0") before they can be sent to OSV as junk data.
 * - Strips leading range operators (^, ~, >=, etc.) but preserves pre-release
 *   identifiers so "1.2.3-beta.1" stays intact rather than becoming "1.2.3.1".
 */
function extractNpmVersion(raw: string): string {
    if (!raw) return '';
    // Reject local file and workspace references — these are not published packages
    if (raw.startsWith('file:') || raw.startsWith('workspace:')) return '';
    // Strip leading range operators: ^, ~, >=, <=, >, <, =
    const stripped = raw.replace(/^[^0-9]*/, '');
    // Must start with digit.digit to be a real version
    return /^\d+\.\d+/.test(stripped) ? stripped : '';
}

/**
 * Automatically searches the home directory for package.json files
 */
async function autoDiscoverNpmProjects(): Promise<string[]> {
    try {
        const home = GLib.get_home_dir();
        // Scan common project locations or full home with limits
        // Exclude node_modules, hidden dirs, and limit depth for performance
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
        // Return unique directories containing package.json
        const dirs = files.map((f: string) => f.substring(0, f.lastIndexOf('/')));
        return Array.from(new Set(dirs));
    } catch (_e) {
        return [];
    }
}

export async function checkOsv(
    packages: PkgInfo[],
    defaultEcosystem: string,
): Promise<{ id: string; pkgName: string }[]> {
    if (packages.length === 0) return [];
    await _initSoup();
    if (!Soup || !soupSession) return [];

    try {
        const vulnerabilities: { id: string; pkgName: string }[] = [];
        const seenIds = new Set<string>();
        const batchSize = 500;

        for (let i = 0; i < packages.length; i += batchSize) {
            const chunk = packages.slice(i, i + batchSize);
            const queries = chunk.map((pkg) => {
                if (pkg.commit && pkg.commit.length === 40) return { commit: pkg.commit };
                const ecosystem = pkg.ecosystem || defaultEcosystem;
                const query: any = { package: { name: pkg.name, ecosystem } };
                if (pkg.version) query.version = pkg.version;
                return query;
            });

            const url = 'https://api.osv.dev/v1/querybatch';
            const message = Soup.Message.new('POST', url);
            const body = JSON.stringify({ queries });
            message.set_request_body_from_bytes(
                'application/json',
                new GLib.Bytes(new TextEncoder().encode(body)),
            );

            try {
                // B-3: pass the module-level cancellable so in-flight requests
                // are aborted when cleanupChecks() is called on extension disable.
                const bytes = await soupSession.send_and_read_async(
                    message,
                    GLib.PRIORITY_DEFAULT,
                    _cancellable,
                );
                if (message.status_code !== 200) continue;
                const data = JSON.parse(new TextDecoder().decode(bytes.get_data() as any));
                if (data.results) {
                    data.results.forEach((res: any, idx: number) => {
                        if (res.vulns) {
                            const pkgName = chunk[idx].name;
                            res.vulns.forEach((v: any) => {
                                const uniqueKey = `${pkgName}:${v.id}`;
                                if (!seenIds.has(uniqueKey)) {
                                    vulnerabilities.push({ id: v.id, pkgName });
                                    seenIds.add(uniqueKey);
                                }
                            });
                        }
                    });
                }
            } catch (_err) {
                /* skip */
            }
        }
        return vulnerabilities.sort((a, b) => a.pkgName.localeCompare(b.pkgName));
    } catch (_e) {
        return [];
    }
}
