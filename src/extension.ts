import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { Extension, gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';

import { detectDistroInfo, logDebug, DistroInfo, SignalTracker } from './utils.js';
import {
    checkDnf,
    checkApt,
    checkZypper,
    checkFlatpak,
    checkOsv,
    getInstalledPackages,
    getFlatpakPkgInfo,
    getLocalGitRepoCommits,
    getNpmPkgInfo,
    getOsvEcosystem,
    cleanupChecks,
    type FlatpakUpdateResult,
} from './checks.js';
import { PackageWatchdogIndicator } from './indicator.js';

export default class PackageWatchdogExtension extends Extension {
    private _settings: Gio.Settings | null = null;
    private _tracker: SignalTracker = new SignalTracker();
    private _cancellable: Gio.Cancellable | null = null;
    private _timeoutId: number | null = null;
    private _initialTimeoutId: number | null = null;
    private _distroInfo: DistroInfo | null = null;
    private _indicator: PackageWatchdogIndicator | null = null;
    private _isChecking: boolean = false;

    enable() {
        this._settings = this.getSettings();
        this._cancellable = new Gio.Cancellable();
        this._indicator = new PackageWatchdogIndicator(this);
        Main.panel.addToStatusArea('package-watchdog', this._indicator);

        // Track settings changes
        this._tracker.connect(this._settings, 'changed::check-interval-hours', () => {
            this._reschedule();
        });

        // Defer initial check to avoid competing for resources at shell startup
        this._initialTimeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 3, () => {
            this._scheduleChecks();
            this._initialTimeoutId = null;
            return GLib.SOURCE_REMOVE;
        });
    }

    disable() {
        this._cancellable?.cancel();
        this._cancellable = null;

        if (this._timeoutId !== null) {
            GLib.Source.remove(this._timeoutId);
            this._timeoutId = null;
        }
        if (this._initialTimeoutId !== null) {
            GLib.Source.remove(this._initialTimeoutId);
            this._initialTimeoutId = null;
        }

        this._tracker.clear();
        this._settings = null;
        this._distroInfo = null;

        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }

        cleanupChecks();
    }

    openSettings() {
        this.openPreferences();
    }

    private _reschedule() {
        if (this._timeoutId !== null) {
            GLib.Source.remove(this._timeoutId);
            this._timeoutId = null;
        }
        this._scheduleChecks();
    }

    private _scheduleChecks() {
        const now = Math.floor(Date.now() / 1000);
        const lastCheck = this._settings?.get_int64('last-check-timestamp') ?? 0n;
        const gapHours = (now - Number(lastCheck)) / 3600;

        if (gapHours >= 6) {
            this._runUpdateCheck();
        } else {
            logDebug(
                'Extension',
                `Skipping startup check — last check was ${gapHours.toFixed(1)}h ago`,
                this._settings,
            );
            // Still refresh the UI with distro/source info
            if (this._indicator) {
                this._getDistroInfo().then((info) => {
                    this._indicator?.updateInfo(info);
                }).catch(() => {/* ignore */});
            }
        }

        const intervalHours = this._settings?.get_int('check-interval-hours') ?? 4;
        this._timeoutId = GLib.timeout_add_seconds(
            GLib.PRIORITY_DEFAULT,
            intervalHours * 3600,
            () => {
                this._runUpdateCheck();
                return GLib.SOURCE_CONTINUE;
            },
        );
    }

    private async _getDistroInfo(): Promise<{ lastCheck: string; distro: string; sources: string }> {
        const now = Math.floor(Date.now() / 1000);
        const cachedName = this._settings?.get_string('cached-distro-name') ?? '';
        const cachedTime = Number(this._settings?.get_int64('cached-distro-timestamp') ?? 0n);
        const daysSinceCache = (now - cachedTime) / (24 * 3600);

        if (cachedName && daysSinceCache < 7) {
            logDebug('Extension', 'Using cached distro info', this._settings);
            if (!this._distroInfo) {
                this._distroInfo = await detectDistroInfo();
            }
        } else {
            const info = await detectDistroInfo();
            this._distroInfo = info;
            this._settings?.set_string('cached-distro-name', info.name);
            this._settings?.set_int64('cached-distro-timestamp', BigInt(now));
        }

        return {
            lastCheck: this._getLastCheckTimeString(),
            distro: this._distroInfo?.name ?? cachedName ?? _('Unknown'),
            sources: this._getMonitoringSourcesString(),
        };
    }

    private _getLastCheckTimeString(): string {
        const lastCheck = Number(this._settings?.get_int64('last-check-timestamp') ?? 0n);
        if (lastCheck === 0) return _('Never');
        return new Date(lastCheck * 1000).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
        });
    }

    private _getMonitoringSourcesString(): string {
        const s = this._settings;
        const sources: string[] = [];
        if (s?.get_boolean('check-system'))
            sources.push(this._distroInfo?.manager.toUpperCase() ?? 'System');
        if (s?.get_boolean('check-flatpak')) sources.push('Flatpak');
        if (s?.get_boolean('check-cve')) sources.push('OSV Security');
        if (s?.get_boolean('check-npm')) sources.push(_('npm Security'));
        return sources.length > 0 ? sources.join(', ') : _('None');
    }

    async _runUpdateCheck(): Promise<number> {
        if (this._isChecking || !this._cancellable || this._cancellable.is_cancelled()) return 0;
        this._isChecking = true;

        try {
            logDebug('Extension', 'Starting background check…', this._settings);

            if (!this._distroInfo) this._distroInfo = await detectDistroInfo();
            if (this._indicator) this._indicator.setBusy(true);

            const s = this._settings;
            const checkSys = s?.get_boolean('check-system') ?? true;
            const checkFlatpakEnabled = s?.get_boolean('check-flatpak') ?? true;
            const checkCveEnabled = s?.get_boolean('check-cve') ?? false;
            const checkNpmEnabled = s?.get_boolean('check-npm') ?? false;
            const autoNpm = s?.get_boolean('npm-auto-discover') ?? false;
            const ignoredPackagesStr = s?.get_string('ignored-packages') ?? '';
            const ignoredPackages = ignoredPackagesStr.split(',').map((p: string) => p.trim()).filter(Boolean);
            const isIgnored = (pkg: string) => ignoredPackages.some((ignored: string) => pkg.includes(ignored));

            let sysUpdates: string[] = [];
            let sysLabel = 'package';
            let cveDetails: { id: string; pkgName: string }[] = [];

            if (checkSys && this._distroInfo) {
                const manager = this._distroInfo.manager;
                if (manager === 'dnf') {
                    sysUpdates = await checkDnf(this._cancellable);
                    sysLabel = 'DNF package';
                } else if (manager === 'apt') {
                    sysUpdates = await checkApt(this._cancellable);
                    sysLabel = 'APT package';
                } else if (manager === 'zypper') {
                    sysUpdates = await checkZypper(this._cancellable);
                    sysLabel = 'Zypper package';
                } else {
                    sysUpdates = await checkApt(this._cancellable);
                    sysLabel = _('APT package');
                    if (sysUpdates.length === 0) {
                        sysUpdates = await checkZypper(this._cancellable);
                        sysLabel = _('Zypper package');
                    }
                }
                
                if (ignoredPackages.length > 0) {
                    sysUpdates = sysUpdates.filter(pkg => !isIgnored(pkg));
                }
            }

            let flatpakResult: FlatpakUpdateResult = checkFlatpakEnabled
                ? await checkFlatpak(this._cancellable)
                : { apps: [], runtimes: [], total: 0 };
                
            if (ignoredPackages.length > 0 && checkFlatpakEnabled) {
                flatpakResult.apps = flatpakResult.apps.filter(pkg => !isIgnored(pkg));
                flatpakResult.runtimes = flatpakResult.runtimes.filter(pkg => !isIgnored(pkg));
                flatpakResult.total = flatpakResult.apps.length + flatpakResult.runtimes.length;
            }

            if (checkCveEnabled && this._distroInfo) {
                const ecosystem = getOsvEcosystem(this._distroInfo);
                const gitPaths = s?.get_string('monitored-git-paths') ?? '';
                const npmPaths = s?.get_string('monitored-npm-paths') ?? '';

                if (ecosystem || gitPaths || (checkNpmEnabled && (autoNpm || npmPaths))) {
                    const pkgs = await getInstalledPackages(this._distroInfo.manager, gitPaths, this._cancellable);
                    if (checkFlatpakEnabled) {
                        pkgs.push(...(await getFlatpakPkgInfo(gitPaths, this._cancellable)));
                    }
                    if (gitPaths) {
                        pkgs.push(...(await getLocalGitRepoCommits(gitPaths, this._cancellable)));
                    }
                    if (checkNpmEnabled) {
                        pkgs.push(...(await getNpmPkgInfo(npmPaths, autoNpm, this._cancellable)));
                    }
                    cveDetails = await checkOsv(pkgs, ecosystem);
                }
            }

            const sysCount = sysUpdates.length;
            const cveCount = cveDetails.length;
            const total = sysCount + flatpakResult.total;

            this._settings?.set_int64(
                'last-check-timestamp',
                BigInt(Math.floor(Date.now() / 1000)),
            );

            if (this._indicator) {
                const info = await this._getDistroInfo();
                this._indicator.updateInfo(info);

                if (total === 0 && cveCount === 0) {
                    this._indicator.updateStatus(0, _('System is up to date'), 0, [], []);
                } else {
                    const parts: string[] = [];
                    if (sysCount > 0)
                        parts.push(`${sysCount} ${sysLabel}${sysCount !== 1 ? 's' : ''}`);
                    if (flatpakResult.apps.length > 0)
                        parts.push(
                            `${flatpakResult.apps.length} Flatpak app${flatpakResult.apps.length !== 1 ? 's' : ''}`,
                        );
                    if (flatpakResult.runtimes.length > 0)
                        parts.push(
                            `${flatpakResult.runtimes.length} Flatpak runtime${flatpakResult.runtimes.length !== 1 ? 's' : ''}`,
                        );

                    let statusText =
                        parts.length > 0
                            ? _('%s available').format(parts.join(', '))
                            : _('Updated');
                    if (cveCount > 0)
                        statusText += _(' (%s security alerts)').format(cveCount);

                    const updateList = [
                        ...sysUpdates,
                        ...flatpakResult.apps,
                        ...flatpakResult.runtimes,
                    ];
                    this._indicator.updateStatus(
                        total,
                        statusText,
                        cveCount,
                        cveDetails,
                        updateList,
                    );
                }
                this._indicator.setBusy(false);
            }

            if (total > 0 || cveCount > 0) {
                this._notify(sysCount, sysLabel, flatpakResult, cveCount);
            }

            return total + cveCount;
        } catch (e: any) {
            logDebug('Extension', `Error during check: ${e?.message ?? e}`, this._settings);
            if (this._indicator) this._indicator.setBusy(false);
            return 0;
        } finally {
            this._isChecking = false;
        }
    }

    async _runCveCheck() {
        if (!this._indicator || !this._cancellable || this._cancellable.is_cancelled()) return;
        try {
            if (!this._distroInfo) this._distroInfo = await detectDistroInfo();
            if (!this._distroInfo) return;

            this._indicator.setBusy(true, _('Scanning for security CVEs…'));

            const ecosystem = getOsvEcosystem(this._distroInfo);
            const gitPaths = this._settings?.get_string('monitored-git-paths') ?? '';
            const checkNpmEnabled = this._settings?.get_boolean('check-npm') ?? false;
            const autoNpm = this._settings?.get_boolean('npm-auto-discover') ?? false;
            const npmPaths = this._settings?.get_string('monitored-npm-paths') ?? '';
            const npmEnabled = checkNpmEnabled && (autoNpm || npmPaths.length > 0);

            if (!ecosystem && !gitPaths && !npmEnabled) {
                this._indicator.updateStatus(0, _('Security scan not supported for this distro'), 0);
                this._indicator.setBusy(false);
                return;
            }

            const pkgs = await getInstalledPackages(this._distroInfo.manager, gitPaths, this._cancellable);
            if (this._settings?.get_boolean('check-flatpak')) {
                pkgs.push(...(await getFlatpakPkgInfo(gitPaths, this._cancellable)));
            }
            if (gitPaths) {
                pkgs.push(...(await getLocalGitRepoCommits(gitPaths, this._cancellable)));
            }
            if (checkNpmEnabled) {
                pkgs.push(...(await getNpmPkgInfo(npmPaths, autoNpm, this._cancellable)));
            }

            const cveDetails = await checkOsv(pkgs, ecosystem);
            const count = cveDetails.length;

            this._indicator.updateStatus(
                0,
                count > 0
                    ? _('%d security alerts').format(count)
                    : _('Security check clear'),
                count,
                cveDetails,
                [],
            );
            this._indicator.setBusy(false);

            if (count > 0) {
                this._notify(0, '', { apps: [], runtimes: [], total: 0 }, count);
            }
        } catch (e: any) {
            logDebug('Extension', `CVE Check Error: ${e?.message ?? e}`, this._settings);
            this._indicator?.setBusy(false);
        }
    }

    _openUpdateManager() {
        try {
            try {
                Gio.AppInfo.launch_default_for_uri('appstream://updates', null);
                this._scheduleRefresh();
                return;
            } catch (_e) {
                /* fall through */
            }

            const managers = [
                'gnome-software --mode=updates',
                'pamac-manager --updates',
                'update-manager',
            ];

            for (const cmd of managers) {
                try {
                    const [success] = GLib.shell_parse_argv(cmd);
                    if (success) {
                        const app = Gio.AppInfo.create_from_commandline(
                            cmd,
                            _('Update Manager'),
                            Gio.AppInfoCreateFlags.NONE,
                        );
                        if (app?.launch([], null)) {
                            this._scheduleRefresh();
                            return;
                        }
                    }
                } catch {
                    /* try next */
                }
            }
            this._openTerminalUpdate();
        } catch {
            /* fail silently */
        }
    }

    private _scheduleRefresh() {
        if (this._timeoutId !== null) {
            GLib.Source.remove(this._timeoutId);
            this._timeoutId = null;
        }
        let remaining = 10;
        this._timeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 30, () => {
            this._runUpdateCheck();
            remaining--;
            if (remaining <= 0) {
                this._timeoutId = null;
                this._scheduleChecks();
                return GLib.SOURCE_REMOVE;
            }
            return GLib.SOURCE_CONTINUE;
        });
    }

    _openTerminalUpdate() {
        const manager = this._distroInfo?.manager ?? 'dnf';
        const checkFlatpakEnabled = this._settings?.get_boolean('check-flatpak') ?? true;

        const lines: string[] = [
            '#!/bin/bash',
            'echo "══════════════════════════════════════"',
            'echo "  Package Watchdog — System Update"',
            'echo "══════════════════════════════════════"',
            'echo',
        ];

        switch (manager) {
            case 'dnf':
                lines.push(
                    'echo "▶ Updating system packages (DNF)..."',
                    'echo',
                    'sudo dnf upgrade -y',
                );
                break;
            case 'apt':
                lines.push(
                    'echo "▶ Updating system packages (APT)..."',
                    'echo',
                    'sudo apt update && sudo apt upgrade -y',
                );
                break;
            case 'zypper':
                lines.push(
                    'echo "▶ Updating system packages (Zypper)..."',
                    'echo',
                    'sudo zypper update -y',
                );
                break;
            default:
                lines.push(
                    'echo "▶ Updating system packages..."',
                    'echo',
                    'sudo dnf upgrade -y',
                );
        }

        if (checkFlatpakEnabled) {
            lines.push(
                'echo',
                'echo "▶ Updating Flatpak applications..."',
                'echo',
                'flatpak update -y',
            );
        }

        lines.push(
            'echo',
            'echo "══════════════════════════════════════"',
            'echo "  ✓ Update process complete"',
            'echo "══════════════════════════════════════"',
            'echo',
            'read -rp "Press Enter to close..."',
        );

        const scriptPath = GLib.build_filenamev([GLib.get_tmp_dir(), 'package-watchdog-update.sh']);
        const file = Gio.File.new_for_path(scriptPath);
        const bytes = new TextEncoder().encode(lines.join('\n') + '\n');
        file.replace_contents(bytes, null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);

        const terminalConfigs: string[][] = [
            ['ptyxis', '--', 'bash', scriptPath],
            ['kgx', '--', 'bash', scriptPath],
            ['gnome-terminal', '--', 'bash', scriptPath],
            ['xterm', '-e', 'bash', scriptPath],
        ];

        for (const argv of terminalConfigs) {
            try {
                const [success, pid] = GLib.spawn_async(
                    null,
                    argv,
                    null,
                    GLib.SpawnFlags.SEARCH_PATH | GLib.SpawnFlags.DO_NOT_REAP_CHILD,
                    null,
                );
                if (success && pid) {
                    this._indicator?.setBusy(true, _('Applying system updates…'));
                    GLib.child_watch_add(GLib.PRIORITY_DEFAULT, pid, () => {
                        GLib.spawn_close_pid(pid);
                        logDebug('Extension', 'Terminal update finished, refreshing…', this._settings);
                        this._runUpdateCheck().then((remaining: number) => {
                            if (remaining === 0) {
                                Main.notify(
                                    _('Package Watchdog'),
                                    _('Update completed. Your system is now up to date.'),
                                );
                            } else {
                                Main.notify(
                                    _('Package Watchdog'),
                                    _(
                                        'Update finished, but %d items still need attention.',
                                    ).format(remaining),
                                );
                            }
                        }).catch(() => {/* ignore */});
                    });
                    return;
                }
            } catch {
                /* try next terminal */
            }
        }
    }

    private _notify(
        sysCount: number,
        sysLabel: string,
        flatpakResult: FlatpakUpdateResult,
        cveCount: number,
    ) {
        const parts: string[] = [];
        if (sysCount > 0) parts.push(`${sysCount} ${sysLabel}${sysCount !== 1 ? 's' : ''}`);
        if (flatpakResult.apps.length > 0)
            parts.push(
                `${flatpakResult.apps.length} Flatpak app${flatpakResult.apps.length !== 1 ? 's' : ''}`,
            );
        if (flatpakResult.runtimes.length > 0)
            parts.push(
                `${flatpakResult.runtimes.length} Flatpak runtime${flatpakResult.runtimes.length !== 1 ? 's' : ''}`,
            );

        let title = _('Updates Available');
        let body = parts.length > 0 ? _('%s ready to install.').format(parts.join(' and ')) : '';

        if (cveCount > 0) {
            title = _('Security Alert');
            const cveText = _('%d security vulnerabilities detected.').format(cveCount);
            body = body ? `${body}\n\n${cveText}` : cveText;
        }

        if (title && body) Main.notify(title, body);
    }
}
