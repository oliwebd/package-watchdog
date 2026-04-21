/**
 * Manual type declarations for GNOME Shell Extension development.
 * Resolves IDE "module not found" and "property missing" errors.
 *
 * NOTE: This file is a global declaration file (no top-level import/export).
 */

// GJS augments String prototype with .format()
interface String {
    format(...args: any[]): string;
}

declare module 'gi://GLib' {
    const GLib: any;
    export default GLib;
}
declare module 'gi://Gio' {
    const Gio: any;
    export default Gio;
}
declare module 'gi://Adw' {
    const Adw: any;
    export default Adw;
}
declare module 'gi://GObject' {
    const GObject: any;
    export default GObject;
}
declare module 'gi://Gtk' {
    const Gtk: any;
    export default Gtk;
}
declare module 'gi://St' {
    const St: any;
    export default St;
}
declare module 'gi://Clutter' {
    const Clutter: any;
    export default Clutter;
}
declare module 'gi://Soup?version=3.0' {
    const Soup: any;
    export default Soup;
}

declare module 'resource:///org/gnome/shell/ui/main.js' {
    export const panel: any;
    export function notify(title: string, body: string): void;
}

declare module 'resource:///org/gnome/shell/extensions/extension.js' {
    export class Extension {
        constructor(metadata: any);
        metadata: any;
        dir: any;
        path: string;
        getSettings(schema?: string): any;
        initTranslations(): void;
        openPreferences(): void;
    }
    export function gettext(text: string): string;
}

declare module 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js' {
    export class ExtensionPreferences {
        constructor(metadata: any);
        metadata: any;
        dir: any;
        path: string;
        getSettings(schema?: string): any;
        initTranslations(): void;
    }
    export function gettext(text: string): string;
}

declare module 'resource:///org/gnome/shell/ui/panelMenu.js' {
    export class Button {
        constructor(menuAlignment: number, nameText: string, dontCreateMenu: boolean);
        _init(menuAlignment: number, nameText: string, dontCreateMenu: boolean): void;
        menu: any;
        add_child(actor: any): void;
        destroy(): void;
    }
}

declare module 'resource:///org/gnome/shell/ui/popupMenu.js' {
    export class PopupMenuItem {
        constructor(text?: string, params?: any);
        label: any;
        connect(signal: string, callback: Function): number;
        insert_child_at_index(actor: any, index: number): void;
        _icon?: any;
        visible: boolean;
        destroy(): void;
    }
    export class PopupSeparatorMenuItem extends PopupMenuItem {
        constructor();
    }
    export class PopupSubMenuMenuItem extends PopupMenuItem {
        constructor(text: string, wantIcon?: boolean);
        menu: any;
    }
    export class PopupMenu {
        addMenuItem(item: any, position?: number): void;
        removeAll(): void;
    }
}
