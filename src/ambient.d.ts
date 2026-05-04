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
            is_cancelled(): boolean;
        }

        class Subprocess {
            static new(argv: string[], flags: number): Subprocess;
            communicate_utf8_async(
                stdin: string | null,
                cancellable: Cancellable | null,
            ): Promise<[string, string]>;
            communicate_utf8_finish(result: any): [string, string];
            wait_async(cancellable: Cancellable | null): Promise<void>;
            wait_finish(result: any): void;
            get_exit_status(): number;
        }

        class File {
            static new_for_path(path: string): File;
            query_exists(cancellable: Cancellable | null): boolean;
            load_contents_async(
                cancellable: Cancellable | null,
            ): Promise<[Uint8Array, string | null]>;
            load_contents_finish(result: any): [Uint8Array, string | null];
            replace_contents(
                contents: Uint8Array,
                etag: string | null,
                makeBackup: boolean,
                flags: number,
                cancellable: Cancellable | null,
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

        class Settings {
            get_boolean(key: string): boolean;
            get_string(key: string): string;
            get_int(key: string): number;
            get_int64(key: string): bigint;
            set_string(key: string, value: string): void;
            set_int64(key: string, value: bigint): void;
            bind(key: string, object: any, property: string, flags: number): void;
            connect(signal: string, callback: (...args: any[]) => void): number;
            disconnect(handlerId: number): void;
        }
    }
    export default Gio;
}

// ── GObject ──────────────────────────────────────────────────────────────────
declare module 'gi://GObject' {
    namespace GObject {
        function registerClass<T>(target: T): T;
        function registerClass<T>(options: any, target: T): T;

        const BindingFlags: {
            DEFAULT: number;
            BIDIRECTIONAL: number;
            SYNC_CREATE: number;
            INVERT_BOOLEAN: number;
        };

        class Object {
            connect(signal: string, callback: (...args: any[]) => any): number;
            disconnect(handlerId: number): void;
            bind_property(
                source_property: string,
                target: Object,
                target_property: string,
                flags: number,
            ): void;
        }
    }
    export default GObject;
}

// ── St ───────────────────────────────────────────────────────────────────────
declare module 'gi://St' {
    namespace St {
        class Widget {
            visible: boolean;
            add_style_class_name(name: string): void;
            remove_style_class_name(name: string): void;
            set_style(style: string): void;
            insert_child_at_index(actor: any, index: number): void;
            add_child(actor: any): void;
            remove_child(actor: any): void;
        }

        class BoxLayout extends Widget {
            constructor(params?: any);
        }

        class Icon extends Widget {
            constructor(params?: any);
            icon_name: string;
        }

        class Label extends Widget {
            constructor(params?: any);
            text: string;
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
    import Gio from 'gi://Gio';
    import GObject from 'gi://GObject';

    namespace Adw {
        class PreferencesPage {
            constructor(params?: any);
            title: string;
            icon_name: string;
            add(group: PreferencesGroup): void;
        }
        class PreferencesGroup {
            constructor(params?: any);
            title: string;
            description: string;
            add(row: any): void;
        }
        class ActionRow extends GObject.Object {
            constructor(params?: any);
            title: string;
            subtitle: string;
            activatable: boolean;
            add_prefix(widget: any): void;
            add_suffix(widget: any): void;
        }
        class SwitchRow extends ActionRow {
            constructor(params?: any);
            active: boolean;
            sensitive: boolean;
        }
        class SpinRow extends ActionRow {
            constructor(params?: any);
            value: number;
        }
        class EntryRow extends ActionRow {
            constructor(params?: any);
            text: string;
            sensitive: boolean;
        }
        class Toast {
            constructor(params?: any);
            title: string;
            timeout: number;
        }
        class PreferencesWindow extends GObject.Object {
            add(page: PreferencesPage): void;
            add_toast(toast: Toast): void;
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
            pixel_size: number;
        }
        class Adjustment {
            constructor(params?: any);
        }
    }
    export default Gtk;
}

// ── Soup ─────────────────────────────────────────────────────────────────────
declare module 'gi://Soup?version=3.0' {
    import GLib from 'gi://GLib';
    import Gio from 'gi://Gio';

    namespace Soup {
        class Session {
            constructor();
            timeout: number;
            send_and_read_async(
                message: Message,
                priority: number,
                cancellable: Gio.Cancellable | null,
            ): Promise<GLib.Bytes>;
        }
        class Message {
            static new(method: string, uri: string): Message;
            status_code: number;
            set_request_body_from_bytes(contentType: string, bytes: GLib.Bytes): void;
        }
    }
    export default Soup;
}

// ── GNOME Shell resources ────────────────────────────────────────────────────

declare module 'resource:///org/gnome/shell/ui/main.js' {
    export const panel: {
        addToStatusArea(id: string, indicator: any): void;
    };
    export function notify(title: string, body: string): void;
}

declare module 'resource:///org/gnome/shell/extensions/extension.js' {
    import Gio from 'gi://Gio';

    export class Extension {
        constructor(metadata: any);
        metadata: any;
        dir: any;
        path: string;
        getSettings(schema?: string): Gio.Settings;
        initTranslations(): void;
        openPreferences(): void;
    }
    export function gettext(text: string): string;
    export function ngettext(singular: string, plural: string, n: number): string;
}

declare module 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js' {
    import Gio from 'gi://Gio';

    export class ExtensionPreferences {
        constructor(metadata: any);
        metadata: any;
        dir: any;
        path: string;
        getSettings(schema?: string): Gio.Settings;
        initTranslations(): void;
    }
    export function gettext(text: string): string;
    export function ngettext(singular: string, plural: string, n: number): string;
}

declare module 'resource:///org/gnome/shell/ui/panelMenu.js' {
    import GObject from 'gi://GObject';

    export class Button extends GObject.Object {
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
        menu: {
            addMenuItem(item: any, position?: number): void;
            removeAll(): void;
        };
        add_child(actor: any): void;
        remove_child(actor: any): void;
        destroy(): void;
    }
}

declare module 'resource:///org/gnome/shell/ui/popupMenu.js' {
    import GObject from 'gi://GObject';
    import St from 'gi://St';

    export class PopupMenuItem extends GObject.Object {
        constructor(text?: string, params?: any);
        label: St.Label;
        visible: boolean;
        _icon?: St.Icon;
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
