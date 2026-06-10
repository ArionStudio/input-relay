# Input Relay

Input Relay lets a verified phone edit a PC-side proxy buffer and request narrow actions such as inserting the final buffer into the currently focused PC input.

The current implementation is focused on this Linux KDE Wayland PC, with adapter boundaries for other platforms.

## Current State

- Rust `axum` relay service.
- React/Vite phone PWA.
- React/Vite desktop control UI with a Tauri shell.
- Shared TypeScript and Rust protocol types.
- Live proxy buffer sync over WebSocket.
- App-level locked/unlocked state with SQLCipher-encrypted local storage.
- Linux Secret Service/KWallet unlock when available, with app password fallback.
- PC-initiated phone registration using a one-time code.
- Per-device permissions and one active phone session.
- KDE Wayland insert adapter using `wl-copy`/`wl-paste` plus `/dev/uinput` Ctrl+V.
- Proxy fallback that brings the Tauri desktop window on top when direct insert fails.
- Lock PC action through KDE ScreenSaver DBus, falling back to `loginctl`.
- Tailscale/local-network readiness detection.

Not implemented yet:

- Passkey registration/authentication.
- Tailscale Serve automation.
- Windows/macOS/X11 input adapters.

## Run locally

Install dependencies:

```sh
pnpm install
```

For this first Linux KDE Wayland target, verify system dependencies with:

```sh
scripts/check-linux-kde-wayland.sh
```

On CachyOS/Arch-like systems, install the expected system dependencies with:

```sh
scripts/install-cachyos-kde-wayland.sh
```

Run the full app on localhost:

```sh
pnpm dev
```

This starts:

- Relay service: `http://127.0.0.1:4317`
- Desktop UI: `http://127.0.0.1:5173`
- Phone PWA: `http://127.0.0.1:5174`

You can also run parts separately:

```sh
pnpm dev:service
pnpm dev:desktop
pnpm dev:phone
```

To test from a phone over Tailscale or a trusted LAN, bind the relay service to a non-loopback host:

```sh
pnpm dev:reachable
```

The phone PWA derives the relay host from the page host when it is not opened on localhost. The desktop UI also reports whether Tailscale is running and whether the relay is reachable from a phone. Do not expose the relay on an untrusted network until passkeys are implemented.

## Register a phone

1. Open the desktop UI and unlock the relay.
2. Go to Register Device.
3. Click Open registration.
4. Open the generated phone URL on the phone.
5. Submit the registration form on the phone.
6. Return to Settings on the PC and grant only the permissions that phone should have.

For isolated storage during testing:

```sh
INPUT_RELAY_DATA_DIR=/tmp/input-relay-dev pnpm dev:service
```

## Project brief

Open `project-brief.html` in a browser for the condensed design brief. The raw interview log is in `grill-me-report.md`.
