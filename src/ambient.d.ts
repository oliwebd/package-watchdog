/**
 * Manual ambient type declarations for GNOME Shell Extension development.
 * Resolves IDE "module not found" errors for gi:// and resource:// imports.
 *
 * NOTE: This file must have NO top-level import/export so it acts as a
 * global declaration script rather than a module.
 */

// GJS augments String prototype with .format()
interface String {
    format(...args: any[]): string;
}

// ── GLib ────────────────────────────────────────────────────────────────────
declare module 'gi://GLib' {
    namespace GLib {
        const PRIORITY_DEFAULT: number;
        const SOURCE_REMOVE: boolean;
        const SOURCE_CONTINUE: boolean;

        function timeout_add(priority: number, interval: number, fn: () => boolean): number;
        function timeout_add_seconds(priority: number, interval: number, fn: () => boolean): number;
        function get_home_dir(): string;
        function get_tmp_dir(): string;
        function build_filenamev(parts: string[]): string;
        function shell_parse_argv(cmd: string): [boolean, string[]];
        function spawn_async(
            workingDir: string | null,
            argv: string[],
            envp: string[] | null,
            flags: number,
            childSetup: any,
        ): [boolean, number];
        function spawn_close_pid(pid: number): void;
        function child_watch_add(priority: number, pid: number, fn: () => void): number;

        const SpawnFlags: {
            SEARCH_PATH: number;
            DO_NOT_REAP_CHILD: number;
        };

        class Bytes {
            constructor(data: Uint8Array | ArrayBuffer);
            get_data(): Uint8Array;
        }

        class Source {
            static remove(id: number): void;
        }
    }
    export default GLib;
}

// ── Gio ─────────────────────────────────────────────────────────────────────
declare module 'gi://Gio' {
    namespace Gio {
        function _promisify(proto: any, asyncMethod: string, finishMethod: string): void;

        const SubprocessFlags: {
            STDOUT_PIPE: number;
            STDERR_SILENCE: number;
            NONE: number;
        };

        const FileCreateFlags: {
            REPLACE_DESTINATION: number;
            NONE: number;
        };

        const SettingsBindFlags: {
            DEFAULT: number;
            GET: number;
            SET: number;
            NO_SENSITIVITY: number;
        };

        const AppInfoCreateFlags: {
            NONE: number;
        };

        class Cancellable {
            constructor();
            cancel(): void;
        }

        class Subprocess {
            static new(argv: string[], flags: number): Subprocess;
            communicate_utf8_async(
                stdin: any,
                cancellable: any,
                callback?: any,
            ): Promise<[string, string]>;
            communicate_utf8_finish(result: any): [string, string];
            wait_async(cancellable: any, callback?: any): Promise<void>;
            wait_finish(result: any): void;
            get_exit_status(): number;
        }

        class File {
            static new_for_path(path: string): File;
            load_contents_async(
                cancellable: any,
                callback?: any,
            ): Promise<[Uint8Array, string | null]>;
            load_contents_finish(result: any): [Uint8Array, string | null];
            replace_contents(
                contents: Uint8Array,
                etag: string | null,
                makeBackup: boolean,
                flags: number,
                cancellable: any,
            ): [boolean, string];
        }

        class AppInfo {
            static launch_default_for_uri(uri: string, context: any): void;
            static create_from_commandline(
                cmd: string,
                appName: string,
                flags: number,
            ): AppInfo | null;
            launch(files: any[], context: any): boolean;
        }
    }
    export default Gio;
}

// ── GObject ──────────────────────────────────────────────────────────────────
declare module 'gi://GObject' {
    namespace GObject {
        function registerClass(target: any): any;
        function registerClass(options: any, target: any): any;

        const BindingFlags: {
            DEFAULT: number;
            BIDIRECTIONAL: number;
            SYNC_CREATE: number;
            INVERT_BOOLEAN: number;
        };
    }
    export default GObject;
}

// ── St ───────────────────────────────────────────────────────────────────────
declare module 'gi://St' {
    namespace St {
        class BoxLayout {
            constructor(params?: any);
            add_child(actor: any): void;
            remove_child(actor: any): void;
        }

        class Icon {
            constructor(params?: any);
            icon_name: string;
            style_class: string;
            add_style_class_name(name: string): void;
            remove_style_class_name(name: string): void;
        }

        class Label {
            constructor(params?: any);
            text: string;
            visible: boolean;
            style_class: string;
            add_style_class_name(name: string): void;
            remove_style_class_name(name: string): void;
            set_style(style: string): void;
        }
    }
    export default St;
}

// ── Clutter ──────────────────────────────────────────────────────────────────
declare module 'gi://Clutter' {
    namespace Clutter {
        const ActorAlign: {
            START: number;
            CENTER: number;
            END: number;
            FILL: number;
        };
    }
    export default Clutter;
}

// ── Adw ──────────────────────────────────────────────────────────────────────
declare module 'gi://Adw' {
    namespace Adw {
        class PreferencesPage {
            constructor(params?: any);
            add(group: any): void;
        }
        class PreferencesGroup {
            constructor(params?: any);
            add(row: any): void;
        }
        class ActionRow {
            constructor(params?: any);
            title: string;
            subtitle: string;
            activatable: boolean;
            add_prefix(widget: any): void;
            add_suffix(widget: any): void;
            connect(signal: string, callback: Function): number;
        }
        class SwitchRow {
            constructor(params?: any);
            active: boolean;
            sensitive: boolean;
            bind_property(
                prop: string,
                target: any,
                targetProp: string,
                flags: number,
            ): void;
        }
        class SpinRow {
            constructor(params?: any);
            value: number;
        }
        class EntryRow {
            constructor(params?: any);
            title: string;
            text: string;
            sensitive: boolean;
        }
        class Toast {
            constructor(params?: any);
        }
    }
    export default Adw;
}

// ── Gtk ──────────────────────────────────────────────────────────────────────
declare module 'gi://Gtk' {
    namespace Gtk {
        class Image {
            constructor(params?: any);
            icon_name: string;
        }
        class Adjustment {
            constructor(params?: any);
        }
    }
    export default Gtk;
}

// ── Soup ─────────────────────────────────────────────────────────────────────
declare module 'gi://Soup?version=3.0' {
    namespace Soup {
        class Session {
            constructor();
            timeout: number;
            send_and_read_async(
                message: any,
                priority: number,
                cancellable: any,
            ): Promise<any>;
        }
        class Message {
            static new(method: string, uri: string): Message;
            status_code: number;
            set_request_body_from_bytes(contentType: string, bytes: any): void;
        }
    }
    export default Soup;
}

// ── GNOME Shell resources ────────────────────────────────────────────────────

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
    export function ngettext(singular: string, plural: string, n: number): string;
}

/**
 * IMPORTANT: GNOME 45+ prefs use a different (mixed-case) resource path.
 * The correct path is /org/gnome/Shell/Extensions/js/extensions/prefs.js
 * NOT /org/gnome/shell/extensions/prefs.js (all lowercase).
 */
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
    export function ngettext(singular: string, plural: string, n: number): string;
}

declare module 'resource:///org/gnome/shell/ui/panelMenu.js' {
    export class Button {
        constructor(
            menuAlignment: number,
            nameText: string,
            dontCreateMenu?: boolean,
        );
        _init(
            menuAlignment: number,
            nameText: string,
            dontCreateMenu?: boolean,
        ): void;
        menu: any;
        add_child(actor: any): void;
        remove_child(actor: any): void;
        destroy(): void;
    }
}

declare module 'resource:///org/gnome/shell/ui/popupMenu.js' {
    export class PopupMenuItem {
        constructor(text?: string, params?: any);
        label: any;
        visible: boolean;
        _icon?: any;
        connect(signal: string, callback: Function): number;
        insert_child_at_index(actor: any, index: number): void;
        destroy(): void;
    }
    export class PopupSeparatorMenuItem extends PopupMenuItem {
        constructor(text?: string);
    }
    export class PopupSubMenuMenuItem extends PopupMenuItem {
        constructor(text: string, wantIcon?: boolean);
        menu: {
            addMenuItem(item: any, position?: number): void;
            removeAll(): void;
        };
    }
    export class PopupMenu {
        addMenuItem(item: any, position?: number): void;
        removeAll(): void;
    }
}
