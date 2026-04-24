import Gio from 'gi://Gio';

if (Gio.Subprocess.prototype.communicate_utf8_async) {
    Gio._promisify(Gio.Subprocess.prototype, 'communicate_utf8_async', 'communicate_utf8_finish');
}
if (Gio.Subprocess.prototype.wait_async) {
    Gio._promisify(Gio.Subprocess.prototype, 'wait_async', 'wait_finish');
}
if (Gio.File.prototype.load_contents_async) {
    Gio._promisify(Gio.File.prototype, 'load_contents_async', 'load_contents_finish');
}

export interface DistroInfo {
    family: string;
    name: string;
    manager: string;
    versionId: string;
}

/**
 * Detects the current distribution information from /etc/os-release (Asynchronous)
 */
export async function detectDistroInfo(): Promise<DistroInfo> {
    try {
        const file = Gio.File.new_for_path('/etc/os-release');
        const [contents] = await file.load_contents_async(null);
        if (!contents)
            return { family: 'unknown', name: 'Unknown', manager: 'none', versionId: '' };

        const text = new TextDecoder().decode(contents);
        const idLike = (text.match(/^ID_LIKE="?([^"\n]+)"?/m) || [])[1] || '';
        const id = (text.match(/^ID="?([^"\n]+)"?/m) || [])[1] || '';
        const versionId = (text.match(/^VERSION_ID="?([^"\n]+)"?/m) || [])[1] || '';
        const prettyName = (text.match(/^PRETTY_NAME="?([^"\n]+)"?/m) || [])[1] || id;

        const all = `${id} ${idLike}`.toLowerCase();

        if (all.includes('fedora') || all.includes('rhel') || all.includes('centos'))
            return { family: 'fedora', name: prettyName, manager: 'dnf', versionId };
        // Check Ubuntu before the generic debian branch — ID_LIKE=debian would match debian otherwise
        if (id === 'ubuntu' || idLike.includes('ubuntu'))
            return { family: 'ubuntu', name: prettyName, manager: 'apt', versionId };
        if (all.includes('debian'))
            return { family: 'debian', name: prettyName, manager: 'apt', versionId };
        if (all.includes('opensuse') || all.includes('suse'))
            return { family: 'opensuse', name: prettyName, manager: 'zypper', versionId };

        return { family: 'unknown', name: prettyName, manager: 'auto-detect', versionId };
    } catch (_e) {
        return { family: 'unknown', name: 'Unknown', manager: 'auto-detect', versionId: '' };
    }
}

/**
 * Shared subprocess helper to read stdout as string
 */
export async function spawnRead(argv: string[]) {
    try {
        const proc = (Gio.Subprocess as any).new(
            argv,
            Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE,
        );
        const [stdout] = await proc.communicate_utf8_async(null, null);
        return { stdout: stdout || '', exitCode: proc.get_exit_status() };
    } catch (_e) {
        return { stdout: '', exitCode: -1 };
    }
}

/**
 * Shared subprocess helper to count lines of output based on a parser
 */
export async function spawnCount(
    argv: string[],
    parser: (stdout: string, exitCode: number) => number,
) {
    const { stdout, exitCode } = await spawnRead(argv);
    return parser(stdout, exitCode);
}

/**
 * Centralized logging utility
 */
export function logDebug(source: string, message: string, settings: any) {
    if (!settings || !settings.get_boolean('debug-mode')) return;
    console.log(`[PackageWatchdog] [${source}] ${message}`);
}
