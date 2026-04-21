# Detailed Technical Specification: Package Watchdog

This document provides a high-resolution technical overview of the Package Watchdog extension for developers and AI agents.

## 🏗️ System Architecture

Package Watchdog is built as a native GNOME Shell extension using **GJS (Gnome JavaScript bindings)** and **TypeScript**. It operates as a privileged background process within the GNOME Shell mutter process.

### 1. Core Components

- **Extension Lifecycle Manager**: Implemented in `src/extension.ts`, handles `enable()` and `disable()` routines and high-level scheduling.
- **Package Watchdog Indicator**: A GObject class in `src/indicator.ts` inheriting from `PanelMenu.Button`. It is initialized lazily and manages the top bar presence.
- **Abstraction Layer**: Modularized in `src/checks.ts`, containing asynchronous helpers (`checkDnf`, `checkApt`, `checkZypper`, `checkFlatpak`) that interface with system package managers.
- **Security Engine**: An OSV (Open Source Vulnerability) client in `src/checks.ts` that performs batch-based queries against `https://api.osv.dev/v1/querybatch`. **Optimization**: Uses lazy loading for the `Soup` library and a shared `Soup.Session`.
- **Shared Utilities**: Centralized in `src/utils.ts` for distro detection, logging, and subprocess management.
- **Type Definitions**: `src/ambient.d.ts` provides manual ambient declarations for GJS and GNOME Shell internal modules, ensuring full IDE support without relying on heavy external dependency chains.

### 2. GSettings Configuration

The extension's persistence is managed via `org.gnome.shell.extensions.package-watchdog.gschema.xml`:

| Key | Type | Description |
|---|---|---|
| `check-system` | Boolean | Toggles monitoring of native system packages (DNF, APT, etc.). |
| `check-flatpak` | Boolean | Toggles monitoring of user/system Flatpak applications. |
| `check-cve` | Boolean | Toggles background security scans via the OSV API. |
| `check-interval-hours` | Integer | Interval for the background timer (default: 4 hours). |
| `debug-mode` | Boolean | Enables verbose logging to `~/.cache/package-watchdog.log`. |
| `monitored-git-paths` | String | Comma-separated list of paths to scan for git vulnerabilities. |

---

## ⚡ Technical Workflows

### 🛡️ OSV Security Protocol

Security scans are performed using a two-stage process to minimize network overhead and respect API limits:

1.  **Collection**: The system package manager (e.g., `rpm -qa` or `dpkg-query`) is queried to build a complete manifest of installed software in `PkgInfo` format (`{name, version}`).
2.  **Batch Processing**: The manifest is sliced into batches of 500 packages.
3.  **API Query**: Each batch is sent as a `POST` request to OSV. **Stability Optimization**: The extension uses a single, shared `Soup.Session` to minimize connection overhead. The `Soup` dependency and session are initialized lazily only when a network check is required.
4.  **Aggregation**: Vulnerability IDs (e.g., `CVE-2024-XXXX`) are collected in a `Set` to ensure uniqueness.

### 🔄 Startup & Scheduling Optimization

The extension implements a non-intrusive background strategy:

1.  **Deferred Initialization**: The initial check is deferred by 3 seconds after extension enablement to avoid competing for resources during shell startup.
2.  **6-Hour Cooldown**: Automatic checks on startup are skipped if the last successful check was performed less than 6 hours ago.
3.  **Polling**: Subsequent checks occur every $N$ hours based on GSettings configuration.

### 🎨 Reactive UI & Indicator States

The indicator implements a robust visual state machine:

- **IDLE**: No updates found. Icon: `software-update-available-symbolic`.
- **BUSY**: Check in progress. Icon: `process-working-symbolic`. CSS: `.package-watchdog-spinning` (CSS keyframe rotation). Badge: Hidden.
- **UPDATES_READY**: Non-security updates found. Icon: `software-update-urgent-symbolic`. Badge: Yellow pill with count.
- **SECURITY_ALERT**: CVEs detected. Icon: `security-high-symbolic`. Badge: Red pill with count.

State restoration is handled by a private `_savedIconName` variable, ensuring the UI reverts to the last correct state after a check completes.

---

## 🏗️ Build & CI Pipeline

1.  **Compilation**: `esbuild` bundles the TypeScript source code into standard ECMAScript modules compatible with GJS.
2.  **Asset Deployment**: `build.ts` performs specialized asset management:
    - Copies `stylesheet.css` to the `dist/` directory.
    - Synchronizes `metadata.json` and compiled schemas.
3.  **Shell Integration**: The build script ensures all resource paths match the expected UUID-based directory structure in `~/.local/share/gnome-shell/extensions/`.

---

## 🔍 Debugging & Maintenance

- **Log Path**: Logs are emitted via `console.log` and can be monitored via `journalctl -f -o cat /usr/bin/gnome-shell`.
- **Signal Handling**: The extension uses a `GObject` signal pattern for UI updates, ensuring that preferences changed in the Adw window are immediately reflected in the background logic via settings bindings.
- **Error Resilience**: All external process spawns are wrapped in `try-catch` blocks with explicit error reporting to the debug log, preventing shell crashes during package manager failures.

---

## ✅ Recent Maintenance (April 2026)

- **IDE Support**: Implemented a comprehensive `ambient.d.ts` to resolve "module not found" errors for `gi://` and `resource://` paths.
- **Linting**: Cleaned up the codebase by removing unused imports and dead code in `src/utils.ts` and `build.ts`.
- **Logic Refinement**: Implemented the 6-hour startup cooldown to improve system responsiveness.
