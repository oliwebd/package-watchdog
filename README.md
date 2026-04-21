# Package Watchdog — Premium GNOME Shell Extension

A modern, high-performance GNOME Shell extension that monitors system and Flatpak updates with integrated security vulnerability scanning via the OSV API.

**GNOME Shell:** 48 · 49 · 50  
**Distros:** Fedora · Debian · Ubuntu · openSUSE · and more...

---

## 🚀 Key Features

### 🛡️ Security First (OSV Integration)
- **Automatic CVE Scanning**: Background scanning of installed packages against the Open Source Vulnerability (OSV) database.
- **Detailed Alerts**: View specific CVE identifiers (e.g., `CVE-2024-XXXX`) directly in the panel menu.
- **Visual Urgency**: Dedicated red branding for security alerts in both notifications and the top panel.

### ✨ Premium UI & Animations
- **Animated Indicator**: The top panel icon provides live visual feedback with a spinning "checking" state.
- **Dynamic Icon Swapping**: Automatically switches to a dedicated loading spinner (`process-working-symbolic`) during active scans.
- **Pill-shaped Badges**: Redesigned update counts with modern typography and state-dependent colors (Blue for updates, Yellow for warnings, Red for CVEs).

### 🛠️ Advanced Dashboard & Actions
- **Structured Layout**: Logically grouped information including last check time, distribution details, and active monitor sources.
- **One-Click Updates**: 
    - **Apply Updates Now**: Automatically detect and launch your system's GUI update manager (GNOME Software, Pamac, etc.).
    - **Terminal Fallback**: Secure terminal-based updates via `pkexec` GUI authentication if a graphical manager isn't available.
- **Manual Control**: Dedicated buttons for "Check Updates Now" and "Check CVEs Now".

---

## 🛠️ Technology Stack

- **TypeScript**: Typed, modern development environment.
- **GJS (Gnome JavaScript)**: Native GNOME API integration.
- **esbuild**: Blazing fast compilation and bundling.
- **Custom CSS**: Unified design system in `src/stylesheet.css`.

---

## 📦 Installation & Build

### Prerequisites
- `pnpm`
- `gettext`
- `glib-compile-schemas`

### Deploy (Recommended)
Build, pack, and install locally in one command:
```bash
pnpm run deploy
```

### Manual Build
```bash
pnpm install
pnpm run build
pnpm run pack
```

---

## 📂 Project Structure

- `src/extension.ts`: Main entry point and extension lifecycle management.
- `src/indicator.ts`: Dedicated module for the panel indicator UI and menu logic.
- `src/checks.ts`: Package manager abstractions and OSV/CVE security logic.
- `src/utils.ts`: Shared utilities, distro detection, and subprocess helpers.
- `src/prefs.ts`: Modern Libadwaita-based preferences window.
- `src/stylesheet.css`: Custom premium styling and animations.
- `build.ts`: Modern build pipeline using `tsx` and `esbuild`.

---

## 🤝 How Distro Detection Works

On initialization, the extension probes your system to select the most efficient package manager:

| Distro family | Package manager | Logic |
|---|---|---|
| Fedora / RHEL | `dnf` | Native DNF 5 supported |
| Debian / Ubuntu | `apt` | APT list integration |
| openSUSE | `zypper` | Native list-updates |
| Generic | `auto-probe` | Sequentially detects available managers |

All security scans use the [OSV API](https://osv.dev/docs/api/) to match local packages against global vulnerability data.

---

## 📝 License
MIT
