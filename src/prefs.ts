import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';

import {
    ExtensionPreferences,
    gettext as _,
} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import { detectDistroInfo, logDebug, DistroInfo } from './utils.js';
import {
    checkDnf,
    checkApt,
    checkZypper,
    checkFlatpak,
    checkOsv,
    getInstalledPackages,
    getOsvEcosystem,
} from './checks.js';

export default class PackageWatchdogPreferences extends ExtensionPreferences {
    private _handlerIds: number[] = [];

    async fillPreferencesWindow(window: Adw.PreferencesWindow) {
        const settings = this.getSettings();
        const distro = await detectDistroInfo();

        const page = new Adw.PreferencesPage({
            title: _('Package Watchdog'),
            icon_name: 'software-update-available-symbolic',
        });
        window.add(page);

        // ── Detected Distribution ────────────────────────────────────────────
        const distroGroup = new Adw.PreferencesGroup({ title: _('Detected Distribution') });
        page.add(distroGroup);

        const distroRow = new Adw.ActionRow({
            title: distro.name,
            subtitle: _('Package manager: %s').format(distro.manager),
            activatable: false,
        });
        distroRow.add_prefix(new Gtk.Image({ icon_name: 'computer-symbolic', pixel_size: 24 }));
        distroGroup.add(distroRow);

        // ── Software Updates ─────────────────────────────────────────────────
        const sourcesGroup = new Adw.PreferencesGroup({
            title: _('Software Updates'),
            description: _('Configure system and application update monitoring.'),
        });
        page.add(sourcesGroup);

        const managerLabelMap: Record<string, string> = {
            dnf: _('DNF — Fedora / RHEL / CentOS'),
            apt: _('APT — Debian / Ubuntu / Mint'),
            zypper: _('Zypper — openSUSE / SLES'),
            'auto-detect': _('System packages (auto-detected)'),
        };
        const managerLabel = managerLabelMap[distro.manager] ?? _('System packages');

        const sysRow = new Adw.SwitchRow({
            title: managerLabel,
            subtitle: _('Monitor native system package updates'),
        });
        settings.bind('check-system', sysRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        sourcesGroup.add(sysRow);

        const flatpakRow = new Adw.SwitchRow({
            title: _('Flatpak apps'),
            subtitle: _('Monitor Flatpak application and runtime updates'),
        });
        settings.bind('check-flatpak', flatpakRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        sourcesGroup.add(flatpakRow);

        const ignoredPackagesRow = new Adw.EntryRow({
            title: _('Ignored Packages'),
        });
        // @ts-ignore
        ignoredPackagesRow.set_tooltip_text(_('Comma-separated list of packages or keywords to ignore (e.g. ibus, kernel)'));
        settings.bind('ignored-packages', ignoredPackagesRow, 'text', Gio.SettingsBindFlags.DEFAULT);
        sourcesGroup.add(ignoredPackagesRow);

        // ── Security Scanning ────────────────────────────────────────────────
        const securityGroup = new Adw.PreferencesGroup({
            title: _('Security Scanning'),
            description: _('Enable proactive vulnerability detection for installed software.'),
        });
        page.add(securityGroup);

        const cveRow = new Adw.SwitchRow({
            title: _('Vulnerabilities (OSV)'),
            subtitle: _('Scan installed packages for known CVEs via OSV.dev API'),
        });
        settings.bind('check-cve', cveRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        securityGroup.add(cveRow);

        const npmRow = new Adw.SwitchRow({
            title: _('Node.js (npm) Security'),
            subtitle: _('Analyze package.json files for dependency vulnerabilities'),
        });
        settings.bind('check-npm', npmRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        securityGroup.add(npmRow);

        const npmAutoRow = new Adw.SwitchRow({
            title: _('Auto-discover projects'),
            subtitle: _('Search home directory for Node.js projects (package.json)'),
        });
        settings.bind('npm-auto-discover', npmAutoRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        securityGroup.add(npmAutoRow);
        npmAutoRow.sensitive = settings.get_boolean('check-npm');
        npmRow.bind_property('active', npmAutoRow, 'sensitive', GObject.BindingFlags.DEFAULT);

        // ── Schedule ─────────────────────────────────────────────────────────
        const schedGroup = new Adw.PreferencesGroup({ title: _('Schedule') });
        page.add(schedGroup);

        const intervalRow = new Adw.SpinRow({
            title: _('Check interval'),
            subtitle: _('Hours between automatic checks (1–24)'),
            adjustment: new Gtk.Adjustment({
                lower: 1,
                upper: 24,
                step_increment: 1,
                page_increment: 4,
            }),
        });
        settings.bind('check-interval-hours', intervalRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        schedGroup.add(intervalRow);

        // ── Git / npm Path Scanning ──────────────────────────────────────────
        const gitGroup = new Adw.PreferencesGroup({
            title: _('Git Repository Scanning'),
            description: _(
                'Match vulnerabilities by Git commit hash. Commit hashes are sent to osv.dev — no source code is transmitted.',
            ),
        });
        page.add(gitGroup);

        const gitPathsRow = new Adw.EntryRow({ title: _('Monitored Git Paths') });
        settings.bind('monitored-git-paths', gitPathsRow, 'text', Gio.SettingsBindFlags.DEFAULT);
        gitGroup.add(gitPathsRow);

        const npmPathsRow = new Adw.EntryRow({ title: _('Monitored npm Paths') });
        settings.bind('monitored-npm-paths', npmPathsRow, 'text', Gio.SettingsBindFlags.DEFAULT);
        gitGroup.add(npmPathsRow);

        const updateNpmPathsSensitivity = () => {
            npmPathsRow.sensitive =
                settings.get_boolean('check-npm') && !settings.get_boolean('npm-auto-discover');
        };
        this._handlerIds.push(settings.connect('changed::check-npm', updateNpmPathsSensitivity));
        this._handlerIds.push(
            settings.connect('changed::npm-auto-discover', updateNpmPathsSensitivity),
        );
        updateNpmPathsSensitivity();

        window.connect('destroy', () => {
            this._handlerIds.forEach((id) => settings.disconnect(id));
            this._handlerIds = [];
        });

        // ── Debug ────────────────────────────────────────────────────────────
        const debugGroup = new Adw.PreferencesGroup({
            title: _('Debugging & Logs'),
            description: _('Log operations to the system journal.'),
        });
        page.add(debugGroup);

        const debugRow = new Adw.SwitchRow({
            title: _('Enable Debug Mode'),
            subtitle: _('Write detailed information to the system journal'),
        });
        settings.bind('debug-mode', debugRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        debugGroup.add(debugRow);

        // ── Actions ──────────────────────────────────────────────────────────
        const actionsGroup = new Adw.PreferencesGroup({ title: _('Actions') });
        page.add(actionsGroup);

        const checkNowRow = new Adw.ActionRow({
            title: _('Check Now'),
            subtitle: _('Run update check immediately'),
            activatable: true,
        });
        checkNowRow.add_prefix(
            new Gtk.Image({ icon_name: 'view-refresh-symbolic', pixel_size: 24 }),
        );
        const checkNowSuffix = new Gtk.Image({ icon_name: 'go-next-symbolic', pixel_size: 16 });
        checkNowRow.add_suffix(checkNowSuffix);
        checkNowRow.connect('activated', () =>
            this._doCheckNow(window, distro, checkNowRow, checkNowSuffix),
        );
        actionsGroup.add(checkNowRow);

        const cveCheckNowRow = new Adw.ActionRow({
            title: _('Check Security Now'),
            subtitle: _('Scan vulnerabilities immediately'),
            activatable: true,
        });
        const cvePrefix = new Gtk.Image({ icon_name: 'security-high-symbolic', pixel_size: 24 });
        cveCheckNowRow.add_prefix(cvePrefix);
        const cveSuffix = new Gtk.Image({ icon_name: 'go-next-symbolic', pixel_size: 16 });
        cveCheckNowRow.add_suffix(cveSuffix);
        cveCheckNowRow.connect('activated', () =>
            this._doCveCheckNow(window, distro, cveCheckNowRow, cvePrefix, cveSuffix),
        );
        actionsGroup.add(cveCheckNowRow);
    }

    async _doCheckNow(window: Adw.PreferencesWindow, distro: DistroInfo, row: Adw.ActionRow, suffix: Gtk.Image) {
        if (!row.activatable) return;
        row.activatable = false;
        suffix.icon_name = 'media-playback-pause-symbolic';

        window.add_toast(new Adw.Toast({ title: _('Checking for updates…'), timeout: 2 }));

        try {
            logDebug('Prefs', 'Starting manual check...', this.getSettings());

            let sysUpdates: string[];
            if (distro.manager === 'dnf') {
                sysUpdates = await checkDnf();
            } else if (distro.manager === 'zypper') {
                sysUpdates = await checkZypper();
            } else {
                sysUpdates = await checkApt();
            }

            const flatpakResult = await checkFlatpak();
            const total = sysUpdates.length + flatpakResult.total;
            const message =
                total === 0 ? _('System is up to date!') : _('%d updates available').format(total);
            window.add_toast(new Adw.Toast({ title: message, timeout: 5 }));
            suffix.icon_name = 'emblem-ok-symbolic';
        } catch (e: any) {
            window.add_toast(
                new Adw.Toast({ title: _('Error: %s').format(e?.message ?? e), timeout: 5 }),
            );
            suffix.icon_name = 'dialog-error-symbolic';
        } finally {
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 3000, () => {
                row.activatable = true;
                suffix.icon_name = 'go-next-symbolic';
                return GLib.SOURCE_REMOVE;
            });
        }
    }

    async _doCveCheckNow(window: Adw.PreferencesWindow, distro: DistroInfo, row: Adw.ActionRow, prefix: Gtk.Image, suffix: Gtk.Image) {
        if (!row.activatable) return;
        row.activatable = false;
        prefix.icon_name = 'system-run-symbolic';
        suffix.icon_name = 'media-playback-pause-symbolic';

        try {
            logDebug('Prefs', 'Starting manual CVE check...', this.getSettings());

            const ecosystem = getOsvEcosystem(distro);
            if (!ecosystem) throw new Error(_('Unsupported ecosystem for OSV scanning'));

            const pkgs = await getInstalledPackages(distro.manager);
            const cveDetails = await checkOsv(pkgs, ecosystem);
            const count = cveDetails.length;

            const message =
                count > 0
                    ? _('%d security alerts found!').format(count)
                    : _('No vulnerabilities detected');
            window.add_toast(new Adw.Toast({ title: message, timeout: 5 }));

            prefix.icon_name = count > 0 ? 'security-high-symbolic' : 'emblem-ok-symbolic';
            suffix.icon_name = 'emblem-ok-symbolic';
        } catch (e: any) {
            window.add_toast(
                new Adw.Toast({
                    title: _('CVE Check Error: %s').format(e?.message ?? e),
                    timeout: 5,
                }),
            );
            prefix.icon_name = 'dialog-error-symbolic';
        } finally {
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 3000, () => {
                row.activatable = true;
                prefix.icon_name = 'security-high-symbolic';
                suffix.icon_name = 'go-next-symbolic';
                return GLib.SOURCE_REMOVE;
            });
        }
    }
}
