import St from 'gi://St';
import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import { gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';
import type PackageWatchdogExtension from './extension.js';

class PackageWatchdogIndicatorInternal extends PanelMenu.Button {
    private _ext: PackageWatchdogExtension;
    private _box: St.BoxLayout;
    private _icon: St.Icon;
    private _badge: St.Label;
    private _loadingLabel: St.Label;
    private _statusItem: PopupMenu.PopupMenuItem | null = null;
    private _lastCheckItem: PopupMenu.PopupMenuItem | null = null;
    private _distroItem: PopupMenu.PopupMenuItem | null = null;
    private _sourcesItem: PopupMenu.PopupMenuItem | null = null;
    private _cveItem: PopupMenu.PopupMenuItem | null = null;
    private _cveSubMenu: PopupMenu.PopupSubMenuMenuItem | null = null;
    private _updateSubMenu: PopupMenu.PopupSubMenuMenuItem | null = null;
    private _savedIconName: string;
    private _menuBuilt: boolean;

    constructor(ext: PackageWatchdogExtension) {
        super(0.5, _('Package Watchdog'), false);
            this._ext = ext;
            this._menuBuilt = false;
            this._savedIconName = 'software-update-available-symbolic';

            this._box = new St.BoxLayout({
                style_class: 'panel-status-indicators-box',
                y_align: Clutter.ActorAlign.CENTER,
            });
            this.add_child(this._box);

            this._icon = new St.Icon({
                icon_name: this._savedIconName,
                style_class: 'system-status-icon',
            });
            this._box.add_child(this._icon);

            this._badge = new St.Label({
                text: '',
                style_class: 'package-watchdog-badge',
                visible: false,
                y_align: Clutter.ActorAlign.CENTER,
            });
            this._box.add_child(this._badge);

            this._loadingLabel = new St.Label({
                text: _('Checking…'),
                style_class: 'package-watchdog-loading-label',
                visible: false,
                y_align: Clutter.ActorAlign.CENTER,
            });
            this._box.add_child(this._loadingLabel);

            // Minimal placeholder item until the menu is lazily built on first open
            this._statusItem = this._createIconMenuItem(
                _('Initializing…'),
                'process-working-symbolic',
            );
            this.menu.addMenuItem(this._statusItem);
        }

        /** Lazily build the full menu on first open to keep enable() fast. */
        _buildMenu() {
            if (this._menuBuilt) return;
            this.menu.removeAll();

            // Header
            const header = new PopupMenu.PopupMenuItem(_('Package Watchdog'), {
                reactive: false,
                style_class: 'package-watchdog-header',
            });
            const headerIcon = new St.Icon({
                icon_name: 'software-update-available-symbolic',
                style_class: 'popup-menu-icon package-watchdog-header-icon',
            });
            header.insert_child_at_index(headerIcon, 0);
            this.menu.addMenuItem(header);
            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

            // Status row
            this._statusItem = this._createIconMenuItem(_('Ready'), 'emblem-ok-symbolic');
            this._statusItem.label.add_style_class_name('package-watchdog-status-text');
            this.menu.addMenuItem(this._statusItem);

            // Last check time
            this._lastCheckItem = new PopupMenu.PopupMenuItem(_('Last Check: Never'), {
                reactive: false,
            });
            this._lastCheckItem.label.add_style_class_name('package-watchdog-info-text');
            this.menu.addMenuItem(this._lastCheckItem);

            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

            // System information section
            const infoHeader = new PopupMenu.PopupMenuItem(_('System Information'), {
                reactive: false,
            });
            infoHeader.label.set_style('font-weight: bold; font-size: 0.8em; opacity: 0.5;');
            this.menu.addMenuItem(infoHeader);

            this._distroItem = this._createIconMenuItem(_('System'), 'computer-symbolic');
            this.menu.addMenuItem(this._distroItem);

            this._sourcesItem = this._createIconMenuItem(_('Monitoring'), 'view-list-symbolic');
            this.menu.addMenuItem(this._sourcesItem);

            // Security alerts (hidden by default)
            this._cveItem = this._createIconMenuItem(
                _('Security Alerts'),
                'security-high-symbolic',
            );
            this._cveItem.visible = false;
            this.menu.addMenuItem(this._cveItem);

            this._cveSubMenu = new PopupMenu.PopupSubMenuMenuItem(_('Vulnerability Details'));
            this._cveSubMenu.visible = false;
            this.menu.addMenuItem(this._cveSubMenu);

            // Update list (hidden by default)
            this._updateSubMenu = new PopupMenu.PopupSubMenuMenuItem(_('Update Details'));
            this._updateSubMenu.visible = false;
            this.menu.addMenuItem(this._updateSubMenu);

            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

            // Actions
            const checkNowItem = this._createActionItem(
                _('Check for Updates Now'),
                'view-refresh-symbolic',
            );
            checkNowItem.connect('activate', () => this._ext._runUpdateCheck());
            this.menu.addMenuItem(checkNowItem);

            const cveCheckItem = this._createActionItem(
                _('Check Security CVEs Now'),
                'security-high-symbolic',
            );
            cveCheckItem.connect('activate', () => this._ext._runCveCheck());
            this.menu.addMenuItem(cveCheckItem);

            const updateNowItem = this._createActionItem(
                _('Apply Updates (GUI)'),
                'software-update-available-symbolic',
            );
            updateNowItem.connect('activate', () => this._ext._openUpdateManager());
            this.menu.addMenuItem(updateNowItem);

            const terminalUpdateItem = this._createActionItem(
                _('Full System Update (Terminal)'),
                'utilities-terminal-symbolic',
            );
            terminalUpdateItem.connect('activate', () => this._ext._openTerminalUpdate());
            this.menu.addMenuItem(terminalUpdateItem);

            const settingsItem = this._createActionItem(
                _('Extension Settings…'),
                'emblem-system-symbolic',
            );
            settingsItem.connect('activate', () => this._ext.openSettings());
            this.menu.addMenuItem(settingsItem);

            this._menuBuilt = true;
        }

        private _createIconMenuItem(text: string, iconName: string): PopupMenu.PopupMenuItem {
            const item = new PopupMenu.PopupMenuItem(text, { reactive: false });
            const icon = new St.Icon({
                icon_name: iconName,
                style_class: 'popup-menu-icon',
                x_align: Clutter.ActorAlign.START,
            });
            item.insert_child_at_index(icon, 0);
            item.label.add_style_class_name('package-watchdog-info-text');
            item._icon = icon;
            return item;
        }

        private _createActionItem(text: string, iconName: string): PopupMenu.PopupMenuItem {
            const item = new PopupMenu.PopupMenuItem(text);
            const icon = new St.Icon({ icon_name: iconName, style_class: 'popup-menu-icon' });
            item.insert_child_at_index(icon, 0);
            return item;
        }

        setBusy(busy: boolean, message: string = _('Checking for updates…')) {
            if (busy) {
                this._savedIconName = this._icon.icon_name;
                this._icon.icon_name = 'process-working-symbolic';
                this._icon.add_style_class_name('package-watchdog-spinning');
                this._badge.visible = false;
                this._loadingLabel.visible = true;
                if (this._statusItem) this._statusItem.label.text = message;
            } else {
                this._icon.icon_name = this._savedIconName;
                this._icon.remove_style_class_name('package-watchdog-spinning');
                this._loadingLabel.visible = false;
                if (this._badge.text && this._badge.text !== '') {
                    this._badge.visible = true;
                }
            }
        }

        updateInfo(info: { lastCheck: string; distro: string; sources: string }) {
            if (!this._menuBuilt) this._buildMenu();
            if (this._lastCheckItem) {
                this._lastCheckItem.label.text = _('Last Check: %s').format(info.lastCheck);
            }
            if (this._distroItem) {
                this._distroItem.label.text = info.distro;
            }
            if (this._sourcesItem) {
                this._sourcesItem.label.text = info.sources;
            }
        }

        updateStatus(
            totalUpdates: number,
            statusText: string,
            cveCount: number = 0,
            cveDetails: { id: string; pkgName: string }[] = [],
            updateList: string[] = [],
        ) {
            if (!this._menuBuilt) this._buildMenu();

            const totalAlerts = totalUpdates + cveCount;
            const isUrgent = cveCount > 0;

            this._badge.remove_style_class_name('package-watchdog-badge-urgent');
            this._badge.remove_style_class_name('package-watchdog-badge-warning');

            if (totalAlerts > 0) {
                this._icon.icon_name = isUrgent
                    ? 'security-high-symbolic'
                    : 'software-update-urgent-symbolic';
                this._badge.text = `${totalAlerts}`;
                this._badge.visible = true;

                if (isUrgent) {
                    this._badge.add_style_class_name('package-watchdog-badge-urgent');
                    if (this._statusItem?._icon)
                        this._statusItem._icon.icon_name = 'security-high-symbolic';
                } else {
                    this._badge.add_style_class_name('package-watchdog-badge-warning');
                    if (this._statusItem?._icon)
                        this._statusItem._icon.icon_name = 'software-update-available-symbolic';
                }
            } else {
                this._icon.icon_name = 'software-update-available-symbolic';
                this._badge.text = '';
                this._badge.visible = false;
                if (this._statusItem?._icon)
                    this._statusItem._icon.icon_name = 'emblem-ok-symbolic';
            }

            this._savedIconName = this._icon.icon_name;

            const cleanStatus = statusText.replace(/[✓⚠⬆✕]/gu, '').trim();
            if (this._statusItem) this._statusItem.label.text = cleanStatus;

            // CVE sub-menu
            if (this._cveItem && this._cveSubMenu) {
                if (cveCount > 0 && cveDetails.length > 0) {
                    this._cveItem.label.text = _('%d security vulnerabilities').format(cveCount);
                    this._cveItem.label.add_style_class_name('package-watchdog-security-alert');
                    this._cveItem.visible = true;

                    this._cveSubMenu.menu.removeAll();
                    const limit = 10;
                    cveDetails.slice(0, limit).forEach((detail) => {
                        const idItem = new PopupMenu.PopupMenuItem(
                            `${detail.pkgName}: ${detail.id}`,
                            { reactive: false },
                        );
                        idItem.label.add_style_class_name('package-watchdog-info-text');
                        idItem.label.set_style('font-family: monospace; font-size: 0.85em;');
                        this._cveSubMenu?.menu.addMenuItem(idItem);
                    });
                    if (cveDetails.length > limit) {
                        const moreItem = new PopupMenu.PopupMenuItem(
                            _('… and %d more').format(cveDetails.length - limit),
                            { reactive: false },
                        );
                        moreItem.label.set_style('font-style: italic; opacity: 0.7;');
                        this._cveSubMenu.menu.addMenuItem(moreItem);
                    }
                    this._cveSubMenu.visible = true;
                } else {
                    this._cveItem.visible = false;
                    this._cveSubMenu.visible = false;
                }
            }

            // Update list sub-menu
            if (this._updateSubMenu) {
                if (totalUpdates > 0 && updateList.length > 0) {
                    this._updateSubMenu.menu.removeAll();
                    const limit = 10;
                    updateList.slice(0, limit).forEach((pkg) => {
                        const pkgItem = new PopupMenu.PopupMenuItem(pkg, { reactive: false });
                        pkgItem.label.add_style_class_name('package-watchdog-info-text');
                        pkgItem.label.set_style('font-size: 0.9em;');
                        this._updateSubMenu?.menu.addMenuItem(pkgItem);
                    });
                    if (updateList.length > limit) {
                        const moreItem = new PopupMenu.PopupMenuItem(
                            _('… and %d more').format(updateList.length - limit),
                            { reactive: false },
                        );
                        moreItem.label.set_style('font-style: italic; opacity: 0.7;');
                        this._updateSubMenu.menu.addMenuItem(moreItem);
                    }
                    this._updateSubMenu.visible = true;
                } else {
                    this._updateSubMenu.visible = false;
                }
            }
        }
}

const PackageWatchdogIndicatorClass = GObject.registerClass(PackageWatchdogIndicatorInternal);

export const PackageWatchdogIndicator = PackageWatchdogIndicatorClass as typeof PackageWatchdogIndicatorInternal;
export type PackageWatchdogIndicator = PackageWatchdogIndicatorInternal;

