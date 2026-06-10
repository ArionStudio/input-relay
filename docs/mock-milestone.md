# Current Milestone

This milestone targets this Linux KDE Wayland PC while keeping the backend adapters replaceable for X11, Windows, and macOS.

## What works

- The Rust service starts locked.
- The desktop UI creates or unlocks a SQLCipher-encrypted local database with the app password.
- Linux Secret Service/KWallet auto-unlock is used when available.
- The phone PWA and desktop UI share one proxy buffer.
- The service broadcasts state changes over WebSocket.
- The PC starts phone registration with a one-time code.
- Registered phones are stored in the encrypted database.
- The PC controls per-device phone permissions.
- Phone buttons are gated by per-device permissions.
- Only one phone can own the active edit session.
- Accept inserts text on this KDE Wayland machine through `wl-copy`/`wl-paste` and `/dev/uinput` Ctrl+V.
- Failed insert keeps the buffer and asks the Tauri desktop window to show on top for manual copy.
- Lock PC uses KDE ScreenSaver DBus when available, with `loginctl` fallback.
- Tauri show/hide behavior is wired for the proxy window.
- Tailscale status and relay reachability are detected and shown in the desktop UI.
- History modes exist, default to `none`, and persist in the encrypted database when enabled.

## Not implemented yet

- Passkey registration and authentication.
- Tailscale Serve setup.
- Windows/macOS/X11 input adapters.

## Run order

```sh
pnpm install
pnpm dev
```

Open:

- Desktop UI: `http://127.0.0.1:5173`
- Phone PWA: `http://127.0.0.1:5174`
- Service health: `http://127.0.0.1:4317/health`

For phone testing on Tailscale or a trusted LAN, restart the app with:

```sh
INPUT_RELAY_HOST=0.0.0.0 pnpm dev
```

Then open the phone PWA using the PC host shown by Vite, such as `http://100.x.x.x:5174`. The PWA will use the same host on port `4317` for the relay API.

## Register a phone

1. Unlock the PC desktop UI.
2. Open Register Device.
3. Click Open registration.
4. Open the generated phone URL.
5. Submit the phone registration form.
6. Configure that phone's permissions in Settings.

For storage tests or isolated dev state, override the data directory:

```sh
INPUT_RELAY_DATA_DIR=/tmp/input-relay-dev pnpm dev:service
```
