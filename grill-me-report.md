# Grill Me Report

Initial user request:
use $grill-me-report backward so we have documented all stuff that was done until now

## Question 1. Should the app type into the currently focused PC input, or do you want a safer clipboard/dedicated-window workflow first?

User answer:
Yes recommended answer is valid

we want to have specific proxy for it i think it will be safer and easier to use also

Agent context:
The recommended answer was to type into the currently focused field on the PC so the app works across arbitrary applications. The user accepted that but added the need for a specific proxy/relay surface, which resolved the branch toward a PC-side relay app that mediates phone input before injection.

## Question 2. Should this work only when phone and PC are on the same Wi-Fi/LAN, or do you need it to work remotely over the internet too?

User answer:
no it should have direct connection, but it should be instant so when i click on phone it should instantly send it to this proxy field

Agent context:
The user prioritized direct connection and low latency. This resolved the transport direction toward a direct phone-to-PC connection, using a persistent realtime channel such as WebSocket rather than cloud relay or polling.

## Question 3. Do you want the phone to send text only when you tap Send, or should it stream live as you type on the phone?

User answer:
we should have option to do both and we should have option to change it on pc

Agent context:
Both modes are required. Send mode allows editing on the phone and submitting deliberately; live mode sends input as it happens. The PC relay should own the active mode so the desktop user can control when injection is live.

## Question 4. In live mode, should the PC receive actual edit operations like backspace/cursor movement, or should it only append newly typed characters?

User answer:
it should operate fully so every operation on input there should be seamleas on pc

Agent context:
Live mode should behave like a remote keyboard, not an append-only text stream. This implies support for printable characters, Backspace, Delete, Enter, Tab, arrows, Home/End, selection modifiers, and common shortcuts where the input backend can provide them.

## Question 5. What OS is the PC target?

User answer:
Yep we should make it like that but it should be system agnostic so layer of controling where we put it shoud be system agnostic.

We should have option to open this app using shortcut and the current input field so on our proxy view it should on accept automaticly put it there

Agent context:
The user did not want the design tied to one OS. This resolved the architecture toward a system-agnostic core relay plus OS/session-specific input backends. The user also introduced the shortcut workflow: focus a PC input, press a shortcut, open the proxy view, preserve the target, then inject on Accept.

## Question 6. Should Accept inject the final text as one batch, or replay the exact key/edit operations that happened on the phone?

User answer:
finale batch

Agent context:
The batch proxy workflow should inject final accepted text as one batch. Exact key/event replay remains relevant for live mode, but Accept mode should prioritize predictability.

## Question 7. How should the phone connect to the PC relay?

User answer:
Yep thats valid, we could use tailsscale

Agent context:
The recommended answer was QR-code connection to the PC relay. The user accepted that and introduced Tailscale as a possible secure private transport. This resolved the direction toward QR bootstrap with Tailscale as the preferred network path.

## Question 8. Should the phone page require pairing/auth every time, or should trusted phones stay paired after scanning once?

User answer:
yup, we should require it but it should be allowed to create registered device if we can be sure that device is that one idk ssh keys or sth like that

Agent context:
The user wants authentication while still allowing registered/trusted devices. The practical browser-first interpretation is one-time QR pairing followed by device registration using a browser-held key pair or passkey, with PC-side device revocation.

## Question 9. Should the phone client be a mobile browser/PWA first, or are you willing to build/install a native Android app?

User answer:
or iphone passkeys

Agent context:
The user shifted the branch from native-vs-PWA to stronger device authentication, specifically iPhone passkeys. This made WebAuthn/passkeys part of the design discussion and raised the HTTPS/stable-origin requirement.

## Question 10. Is the first version allowed to require Tailscale HTTPS / stable Tailscale name to unlock passkeys, or should first version work on plain local LAN with no certificates?

User answer:
Can we use passkey as default?

Agent context:
The user preferred passkeys as the default rather than as a later enhancement. This implies the first version should use a secure origin, most cleanly through Tailscale MagicDNS plus HTTPS, instead of plain LAN HTTP.

## Question 11. Are you OK with Tailscale connected on both phone and PC so passkeys can be the default?

User answer:
it need paid plan?

Agent context:
The user did not immediately accept the requirement and asked about cost. The resulting constraint is that the default setup should rely only on Tailscale capabilities available for personal/free use, and should avoid Tailscale Funnel or paid-only assumptions.

## Question 12. Should we make Tailscale Personal + passkey auth the default setup path, with a fallback LAN dev mode that uses QR token auth but no passkeys?

User answer:
Okay we can relay on that

Agent context:
This confirmed Tailscale Personal plus passkey auth as the expected default path. The settled baseline is private Tailscale transport, MagicDNS/HTTPS, passkey authentication, QR bootstrap, and no public Funnel exposure.

## Question 13. For the first OS backend, should we target your current Linux desktop first?

User answer:
Yes recomended is valid,
X11 and Wayland is layer of this

so its not just linux its LinuxWayland LinuxX11

Agent context:
The user accepted Linux first but clarified that X11 and Wayland are separate backend layers. The backend naming and capability model should reflect session-specific behavior, such as LinuxX11Backend and LinuxWaylandBackend rather than a single generic Linux backend.

## Question 14. What desktop session do you personally run right now: X11 or Wayland, and which desktop/compositor?

User answer:
We should have checker for this in our app for every system so it detect it automaticly, and default to clipboard if other is not detected and allow to change to clibpoard midfly

Agent context:
The user wants automatic backend detection instead of manual desktop-session selection. The app should detect system/session at startup, select the best available input backend, default to ClipboardBackend if direct injection is unavailable, and allow runtime switching to clipboard.

## Question 15. In clipboard fallback, should Accept only copy text to clipboard, or should it also try to paste into the target automatically?

User answer:
Then it could not paste to target becouse we do not have system utils

okay its wrong becouse then we cannot use also cliboard becouse its also system driven?

Agent context:
The user correctly challenged the assumption that clipboard fallback is independent of system integration. Clipboard access is also an OS/session backend capability. The corrected model is that clipboard is not a universal no-system fallback; it is a lower-permission backend that may be easier and more reliable than focus/keyboard injection, but it still needs platform support through native APIs, toolkit APIs, or utilities such as wl-clipboard/xclip/xsel on Linux.

## Question 16. Should the app require at least one working system backend before it is considered usable, or should it allow proxy-only mode where the phone sends text to the PC app but the app cannot inject/copy/paste anywhere?

User answer:
yep it should just have mocked backned for debuging or testing

Agent context:
The normal app should require a working real backend for practical use. A mocked backend should exist only for debugging and testing, allowing the relay, phone UI, pairing, passkeys, and workflow state to be exercised without touching the OS.

## Question 17. What desktop/session backend is this PC currently using?

User answer:
What we use on this pc?

Agent context:
Resolved from local context. Environment variables and loginctl report XDG_SESSION_TYPE=wayland, XDG_CURRENT_DESKTOP=KDE, DESKTOP_SESSION=plasma, WAYLAND_DISPLAY=wayland-0, DISPLAY=:0, and loginctl session Type=wayland, Desktop=KDE. This PC is currently running KDE Plasma on Wayland. Available checked utilities include loginctl and wl-copy; xdotool, ydotool, wtype, xclip, and xsel were not found in PATH.

## Question 18. What should be the first concrete target environment?

User answer:
Our first target is our pc period.
Our app should install all needed dependencies with itself, for directed env after detection
can create install via gitrepo? so it enough to install it on other pc? or we need to do it difrently?

Agent context:
The first concrete target is this PC, currently KDE Plasma on Wayland. The app should detect the environment and install or guide installation of only the dependencies needed for that detected backend. A git repository with an installer script is valid for a personal/dev first version, but production-quality distribution may later need OS packages or app bundles. The installer must separate bundled app dependencies from privileged system packages and services.

## Question 19. Should the first installer be Linux-only for your KDE Wayland PC, or should it already support multiple Linux package managers like apt, dnf, and pacman?

User answer:
for start we will do it for this specific env and ready to add other ones

Agent context:
The first installer should target only the current environment, KDE Plasma on Wayland, while keeping the installer/backend structure extensible for future environments. Detection should identify unsupported systems and exit clearly rather than pretending to support them.

## Question 20. What app shell should we use for the PC relay?

User answer:
We do not want phone app becouse its unnecesary in our uc we can have web / pwa app
same for passkey we need it
yes split into two app is proper but we are doing monorepo
if tauri allow that thats okay its sth we can use react with?

Agent context:
The user confirmed no native phone app; the phone client should be web/PWA. Passkeys remain required. A split between PC app and phone web app is acceptable if managed in one monorepo. Tauri supports React for the desktop UI, with Rust for native commands/backends, so the recommended stack remains Tauri plus React/TypeScript, alongside a separate React/TypeScript phone PWA package in the monorepo.

## Question 21. Should the phone PWA be served by the desktop relay app itself, or deployed separately somewhere?

User answer:
yes it should be directly on pc so it will be close as posible to user

Agent context:
The phone PWA should be served directly from the PC relay, not deployed to an external host. This keeps latency low, keeps the control plane local/private, and ensures the QR code points to the same machine that will inject or proxy input.

## Question 22. Should the HTTP/WebSocket relay server run inside the Tauri desktop app process, or as a separate background service that the Tauri UI controls?

User answer:
recommended sounds better

Agent context:
The selected architecture is a separate background service controlled by the Tauri desktop UI. The service should own the HTTP/WebSocket server, phone PWA serving, sessions, auth, and input backend execution. The Tauri app should provide tray/proxy/control UI, QR display, shortcut handling where appropriate, backend status, and device management.

## Question 23. Should the background service own passkey auth, device registry, and input backend execution, with Tauri only acting as a local admin UI?

User answer:
yep

Agent context:
The background service is the security and execution authority. It owns registered devices, passkey/WebAuthn validation, phone sessions, mode state, backend selection, and injection/copy operations. The Tauri app is a local admin/control UI that must authenticate to the service through a local-only mechanism.

## Question 24. How should the Tauri desktop UI authenticate/control the local background service?

User answer:
wait for this please describe all posible options, their advantages and cons

We will go with strongest saftly for linux idk if 2 or 3

but it will be adapter so we can use diffrent model for windows and mac os

Agent context:
The evaluated options were loopback HTTP/WebSocket with admin token, Unix domain socket with file permissions, Unix socket with peer credentials, localhost mTLS, D-Bus, sidecar stdio, same-process Tauri backend, and unauthenticated localhost. The selected direction is the strongest practical Linux approach: Unix domain socket IPC, preferably with peer credential verification, behind an IPC adapter so Windows and macOS can use different local control transports later.

## Question 25. Are you OK with the Tauri React UI not talking directly to the service, but instead calling Tauri Rust commands that bridge to the Unix socket?

User answer:
Yup but this should be adapter based so on other system we should have addapter that realise that

Agent context:
The Tauri React UI should call Tauri Rust commands rather than opening the Linux admin socket directly. The Rust side should use an AdminIpcAdapter abstraction so Linux can use Unix socket plus peer credentials, while future Windows/macOS implementations can use named pipes, platform IPC, or another safe local transport without changing the React UI.

## Question 26. Should we keep Admin IPC adapters separate from Input backend adapters?

User answer:
yep

Agent context:
Admin IPC adapters and input backend adapters should be separate. Admin IPC controls how the local desktop UI talks to the service; input backends control how the service interacts with focused applications. This keeps local security transport independent from OS/session input injection capabilities.

## Question 27. For the first KDE Wayland MVP, what minimum input capability must work?

User answer:
but we do not need handle keyboard we just need send actions and modify our input using it there should not controll keyboard on our pc at all

Agent context:
The user corrected the earlier "remote keyboard" framing. Phone actions should modify the relay/proxy input buffer owned by the app, not synthesize global keyboard events on the PC during editing. This removes live OS keyboard control from the intended design. The remaining unresolved boundary is what mechanism Accept is allowed to use to place final batch text into the originally focused target, because arbitrary target insertion still requires some OS/session integration unless the target is inside the relay app.

## Question 28. When you press Accept, is the app allowed to use OS-level integration to place the final text into the previously focused target?

User answer:
if we want some actions to handle we should have it defined like lock pc or sth

Agent context:
The user wants explicit, named actions rather than generic PC keyboard control. Any operation that affects the PC outside the proxy buffer should be represented as a defined command with narrow semantics, such as AcceptInsertText or LockPc. This supports an allowlisted action model where the phone/service cannot perform arbitrary keyboard input unless a specific action has been designed and enabled.

## Question 29. Should the phone be allowed to trigger AcceptInsertText, or should Accept only be possible from the PC proxy window?

User answer:
we should allow it for verfied phones

Agent context:
Verified/registered phones may trigger AcceptInsertText. This means device authentication is not just identity; it also gates privileged actions. The app should distinguish anonymous/unpaired sessions, paired devices, and verified trusted devices with explicit permissions for actions such as accepting insertion into the target.

## Question 30. Should permissions be global for all verified phones, or configurable per registered device?

User answer:
registration of phone device on pc should be initaited from server pc

Agent context:
The user did not directly choose global vs per-device permissions, but clarified that phone registration must be initiated from the PC/server side. This implies the PC is the authority for approving devices and assigning trust/permissions during registration. The permission granularity remains to be explicitly resolved, with per-device permissions still recommended.

## Question 31. When PC approves a phone, should permissions be per device?

User answer:
yes per device

Agent context:
Permissions should be assigned per registered device. The PC/server remains the authority that initiates registration, approves the device, and grants specific action permissions such as editBuffer and acceptInsertText.

## Question 32. What permissions should exist in the MVP?

User answer:
last one is out of scope

lockpc is needed

Agent context:
The proposed manageOwnDevice permission is out of scope for the MVP. The lockPc action is required in the MVP. The MVP permission set should include buffer editing and final insertion actions, plus lockPc as an explicit privileged PC action gated by per-device permissions.

## Question 33. Should lockPc require PC-side approval each time, or can a verified phone with lockPc permission lock immediately?

User answer:
yes

Agent context:
The user accepted the recommendation: a verified phone with lockPc permission can lock immediately without per-action PC confirmation. The lockPc permission should be denied by default and explicitly granted per device from the PC.

## Question 34. For AcceptInsertText, are you willing to let the backend use whatever safe OS mechanism is available, as long as the app exposes only the narrow acceptInsertText action?

User answer:
yes

Agent context:
The backend may use the safest available OS/session mechanism to implement AcceptInsertText, while exposing only the narrow named action to phones and UI. On KDE Wayland this may involve clipboard, paste trigger, portal/compositor integration, or a helper, but the device permission model must not grant arbitrary keyboard control.

## Question 35. May AcceptInsertText use the clipboard internally on KDE Wayland if that is the most reliable mechanism?

User answer:
yup if this is the safest way to do it then yes

Agent context:
Clipboard use is allowed as an internal implementation detail for AcceptInsertText if it is the safest or most reliable route on KDE Wayland. The backend should preserve and restore the previous clipboard when possible, and the UI should report capability limitations if clipboard preservation, paste triggering, or focus restore is unavailable.

## Question 36. Should AcceptInsertText require the app to remember the original focused target when the proxy opens, then restore it before insertion?

User answer:
y

Agent context:
AcceptInsertText should remember the original focused target when the proxy opens and restore it before insertion where the backend supports that capability. This prevents text from being inserted into whichever window happens to be focused later. If focus restore is unsupported, the app needs an explicit degraded/manual flow.

## Question 37. If KDE Wayland cannot reliably restore the original target, should the fallback be manual target confirmation?

User answer:
but it do not make sens if i focus on filed and on other app click accept then this field lose focus so you say shit

default is: we create input via phone on proxy input -> we click on phone accept -> it send it curently focused input field if there is no field that is focused or we cannot input text to that focused field
then it should focus our proxy input and make it on top of apps so we can copy it manualy

Agent context:
The user corrected the fallback and target model. Accept should primarily be triggered from the phone, so it does not steal PC focus. The default target is the currently focused PC input at the moment Accept is triggered, not necessarily a restored remembered target. If the backend cannot insert into the currently focused field, the app should bring the proxy input to the front and focus it so the user can manually copy the prepared text.

## Question 38. Should PC-side Accept via mouse click be removed/disabled by default, since clicking it steals focus?

User answer:
yes exacltly

Agent context:
PC-side mouse Accept should not perform target insertion by default because clicking it changes PC focus. Focus-safe insertion triggers should be phone Accept or a global PC shortcut. PC UI buttons can support manual copy/proxy workflows, but not direct target insertion unless the backend can safely handle focus restoration.

## Question 39. What global PC shortcuts should exist in the MVP?

User answer:
yes

Agent context:
The MVP should include global shortcuts for opening/showing the proxy, accepting the current buffer into the currently focused target without mouse focus change, canceling/hiding the proxy, and optionally locking the PC. Exact key combinations can be chosen as defaults and made configurable later.

## Question 40. Should the MVP controls be global keyboard shortcuts or buttons/actions?

User answer:
they should be buttons not key kombos

Agent context:
The previous shortcut framing was corrected. MVP controls should be explicit buttons/actions rather than keyboard-combo shortcuts. Because PC mouse clicks can steal focus, target insertion must distinguish between phone-side buttons, PC-side buttons, and backend-supported focus handling. Phone-side Accept remains focus-safe because it does not move PC focus.

## Question 41. What should happen to accepted text history?

User answer:
history last 10 by default and if enabled just store it in separete window as history

Agent context:
The app should support an input history feature with a default limit of the last 10 entries. History should not clutter the main proxy input; it should live in a separate history window/view when enabled. This changes the earlier privacy-oriented recommendation from no persistent history to bounded configurable history.

## Question 42. Is history enabled by default, or is the limit of 10 only the default when the user turns history on?

User answer:
we have 3 option

none
last X
all

Agent context:
History should be modeled as an explicit setting with three modes: none, last X entries, and all entries. The "last X" mode should default X to 10 unless configured otherwise. The default selected mode remains unresolved.

## Question 43. Which history mode is the default?

User answer:
none

Agent context:
The default history mode is none. History remains available as an explicit setting with modes none, last X, and all. When last X is selected, the default value for X should be 10.

## Question 44. Which buttons should exist on the phone PWA for MVP?

User answer:
Yep

Agent context:
The MVP phone PWA should include buttons for Accept, Clear, Lock PC, and Show Proxy. Accept inserts the current proxy buffer into the currently focused PC input when permitted. Clear clears the proxy buffer. Lock PC locks the PC if the device has lockPc permission. Show Proxy brings the PC proxy window to the front for manual copy/debug.

## Question 45. Which buttons should exist on the PC proxy window for MVP?

User answer:
yea

Agent context:
The MVP PC proxy window should include Copy, Clear, History, Register Device, Settings, and Hide. It should not include mouse-click target insertion by default because that can steal focus. PC-side controls should focus on manual copy, buffer management, history, device registration, settings, and window visibility.

## Question 46. Is there one shared proxy buffer for the PC, or does each connected phone/session get its own buffer?

User answer:
yep one device max on active session

Agent context:
The MVP should allow only one active phone/device session at a time. The active session owns the shared proxy buffer shown in both the phone PWA and PC proxy window. Multi-device editing and conflict resolution are out of scope for the MVP.

## Question 47. If another verified phone connects while one device already has the active session, what should happen?

User answer:
y

Agent context:
If a second verified phone connects while another device owns the active session, the second phone should see a read-only/status view. It cannot edit or trigger Accept. A request-control flow may be added later; for MVP, the PC can force-switch active device from device management if needed.

## Question 48. Where should the service store config, registered devices, credentials, and history?

User answer:
ok

Agent context:
The service should store structured state in a SQLite database under the user data directory, with optional filesystem config for non-secret settings. On Linux this means paths such as ~/.local/share/input-relay/input-relay.db, ~/.config/input-relay/config.toml, and /run/user/$UID/input-relay/admin.sock for runtime IPC.

## Question 49. Should the SQLite database be encrypted at rest?

User answer:
it should be and we need password on open to decrypt it

Agent context:
The database should be encrypted at rest, and the user must enter a password on app/service open to decrypt it. This introduces a locked/unlocked service state: registered devices, permissions, history, and other encrypted state should be unavailable until the PC user unlocks the service. The design must include password-based key derivation and a clear unlock flow.

## Question 50. When the service starts locked, should phone connections be rejected until the PC user unlocks the database?

User answer:
it should unlock app, its not only database but just access to use it

Agent context:
The password unlocks the app as a whole, not merely database access. While locked, the service should not allow phone control, device registration, AcceptInsertText, LockPc, history access, or other app actions. The encrypted database is one part of the locked state, but the user-facing model is app access control.

## Question 51. Should the app require the password every time the service starts, or may it use the OS keychain/session to auto-unlock after login?

User answer:
os keychain if it safe its nice

Agent context:
The app may use the OS keychain/session for convenience if it preserves the app-lock security model. On the current KDE environment, local checks show KWallet/Secret Service tooling is available: secret-tool, kwallet-query, qdbus6/qdbus, and running processes ksecretd and kwalletd6. The recommended model is password-based encryption with optional storage of an unlock secret or wrapped key in the OS keychain, controlled by a setting and falling back to manual password unlock when unavailable.

## Question 52. Should keychain auto-unlock be opt-in during setup, or enabled by default when available?

User answer:
no os keychain as default and ofc it should be adapter that per system it should its own feature for it

Agent context:
OS keychain should be the default unlock mechanism when available. It must be implemented behind a KeychainAdapter abstraction so KDE/Linux can use KWallet or Secret Service, while future Windows/macOS builds can use their own native credential stores. Manual password unlock remains an unresolved fallback/recovery question.

## Question 53. Do we still need a separate app password as fallback/recovery if the OS keychain is unavailable or cleared?

User answer:
okay

Agent context:
The app should keep a separate app password as fallback/recovery. Normal startup uses OS keychain unlock when available. If the keychain is unavailable or cleared, the user can unlock with the app password. If the password is forgotten, the recovery path is resetting app state and losing registered devices, history, and protected settings.

## Question 54. Should we encrypt the entire SQLite database file, or only sensitive fields inside it?

User answer:
full

Agent context:
The entire SQLite database should be encrypted, not only selected sensitive fields. The preferred implementation target is whole-database encryption, such as SQLCipher or an equivalent Rust-compatible encrypted SQLite layer, so the locked state has a simple and comprehensive meaning.

## Question 55. When the app is locked, should the phone PWA still load and show "PC relay locked," or should it fail/reject before loading?

User answer:
okay

Agent context:
When the app is locked, the phone PWA may load only a minimal locked page showing that the PC relay is reachable but locked. It must not expose devices, buffer contents, history, permissions, registration data, or actions until the PC app is unlocked.

## Question 56. What should the first-run setup order be?

User answer:
Y

Agent context:
The first-run setup order should be: detect environment, create app password, set up OS keychain unlock, initialize encrypted database, configure the Tailscale URL, and register the first phone through PC-initiated QR/passkey approval.

## Question 57. Should the app installer configure Tailscale Serve automatically, or only detect/check it and show the exact command to run?

User answer:
okay, list all left question bellow

Agent context:
The user accepted the recommendation that the installer should detect/check Tailscale state and show the exact command first, rather than automatically configuring Tailscale Serve. The app should verify that Tailscale is installed, logged in, MagicDNS/HTTPS are available, and Serve is configured for the relay port, while avoiding Funnel unless explicitly requested.

## Question 58. What package manager/build tooling should the monorepo use?

User answer:
1.okay, can we use vite plus, or turborepo also?

Agent context:
pnpm workspaces are accepted as the package manager/workspace base. Vite is appropriate for the React desktop frontend and phone PWA builds. Turborepo can be added as a monorepo task orchestrator/cache layer; it is not a replacement for Vite, and is optional for the MVP unless the repo quickly gains enough packages/tasks to benefit from it.

## Question 59. What backend language should the service use?

User answer: 2. yep

Agent context:
The background service should use Rust, matching the Tauri native ecosystem and providing a strong fit for system adapters, IPC adapters, WebSocket service logic, and secure local execution.

## Question 60. Which Rust web framework should serve the phone PWA/API/WebSocket?

User answer: 3. list options witj cons nad pros

Agent context:
The framework choice remains unresolved. The user requested a pros/cons list before choosing. Candidate options include axum, actix-web, poem, warp, and rocket.

## Question 61. Which encrypted SQLite approach should we use?

User answer: 4. list

Agent context:
The encrypted database implementation remains unresolved. The user requested a list of options. The requirement is whole-database encryption, with OS keychain default unlock and app password fallback.

## Question 62. How should WebAuthn/passkeys be implemented server-side?

User answer: 5. yup

Agent context:
Server-side WebAuthn/passkey handling should use a maintained Rust WebAuthn crate rather than custom cryptography or hand-rolled protocol validation.

## Question 63. What is the exact phone editing protocol?

User answer: 6. okay

Agent context:
The phone editing protocol should use structured actions such as setText, insertText, deleteRange, setSelection, accept, clear, and lockPc. These actions target the app-owned proxy buffer and explicit app commands, not arbitrary PC keyboard control.

## Question 64. Should phone editing use full text snapshots or operational edits?

User answer: 7. for later

Agent context:
The snapshot-vs-operational-edit protocol detail is deferred. For architecture, the protocol should remain versioned so the MVP can start simple and evolve to richer edit actions later without breaking clients.

## Question 65. Should the phone PWA work offline?

User answer: 8. live connection needed

Agent context:
The phone PWA requires a live connection to the PC relay. Offline behavior is out of scope except for a basic installed shell or reconnect screen.

## Question 66. How should the PC proxy window be shown?

User answer: 9. okay

Agent context:
The PC proxy window should be a Tauri utility-style window, hidden by default and capable of being shown/on-top for manual copy, status, registration, and debugging workflows.

## Question 67. Should the proxy window show the current buffer even when locked?

User answer: 10. no

Agent context:
The proxy window must not show the buffer while the app is locked. Locked state should hide protected state and require OS keychain unlock or app password fallback before use.

## Question 68. How do we implement lockPc on KDE Wayland?

User answer: 11. y

Agent context:
The lockPc action should be implemented through a KDE/session-specific command adapter detected during install, with capability reporting if unsupported.

## Question 69. How do we implement acceptInsertText on KDE Wayland first?

User answer: 12. Okay

Agent context:
The first KDE Wayland acceptInsertText implementation should investigate and use the safest available mechanism, likely clipboard plus paste trigger if reliable, with clear capability reporting and fallback behavior.

## Question 70. What happens if insertion fails?

User answer: 13. y, and inform mobile with toast

Agent context:
If insertion fails, the app should bring the proxy window on top with the text available for manual copy and also inform the mobile PWA with a toast/status message.

## Question 71. Should accepted text clear the buffer after insert?

User answer: 14. y

Agent context:
After successful AcceptInsertText, the proxy buffer should clear by default.

## Question 72. What permissions are granted to the first registered phone by default?

User answer: 15. editBuffer, pc will chose other

Agent context:
The first registered phone should receive editBuffer by default. Other permissions, including acceptInsertText, clearBuffer, showProxy, and lockPc, should be chosen explicitly on the PC during approval.

## Question 73. What should the device approval UI show?

User answer: 16. beside last pc choose permissions

Agent context:
The approval UI should show device identity/status details and let the PC choose permissions explicitly. The phone should not self-grant or dictate privileged permissions.

## Question 74. How are devices revoked?

User answer: 17. Y

Agent context:
Devices should be revoked from PC settings only. Revocation should immediately disconnect active sessions and prevent future authenticated control from that device.

## Question 75. Should logs include text contents?

User answer: 18. y

Agent context:
The recommendation was that logs should never include text contents. The user's "y" is interpreted as accepting that recommendation. Logs may include metadata and error/capability events, but not proxy buffer contents, accepted text, history entries, or clipboard text.

## Question 76. What should installer do when unsupported environment is detected?

User answer: 19. then inform that we do not support it

Agent context:
When an unsupported environment is detected, the installer/app should clearly inform the user that the environment is not supported for normal operation. It may allow mock/debug mode, but should not pretend direct input actions are supported.

## Question 77. What is MVP success definition?

User answer: 20. y

Agent context:
The MVP success definition is accepted: installed on this KDE Wayland PC, phone pairs via Tailscale/passkey, edits the proxy buffer through a live connection, Accept inserts into the currently focused PC input or safely falls back with mobile notification, and Lock PC works when granted.

## Question 78. What technology should the phone web/PWA client use?

User answer:
i want shadcn also to be used, if its needed tanstack things also

Agent context:
The phone web/PWA client should use React, TypeScript, and Vite, with shadcn/ui as the component foundation. TanStack libraries are acceptable where useful, but should be added for concrete needs rather than by default. Likely candidates are TanStack Query for server state, TanStack Router if the PWA grows beyond a few simple views, and TanStack Table/Virtual only if history or device views need them.

## Question 79. Should the PC Tauri UI use the same frontend stack: React + TypeScript + Vite + shadcn/ui + Tailwind?

User answer:
[Image attachment showing shadcn/create configured with Template: Vite, Base: Base UI, package manager: pnpm, RTL disabled, and monorepo toggle not enabled.]

Agent context:
The PC Tauri UI should use the same frontend stack as the phone PWA: React, TypeScript, Vite, shadcn/ui, Tailwind, and pnpm. The screenshot also indicates a preference for shadcn's Base UI primitive base. The shadcn built-in monorepo generator should not be used blindly unless its generated structure matches our app; our custom monorepo needs desktop, phone-web, service, protocol, and adapter packages.

## Question 80. What exact shadcn preset command should be used for UI scaffolding?

User answer:
okay there is command for created shadc presset pnpm dlx shadcn@latest init --preset b2pl2jQxu --base base --template vite --pointer

Agent context:
The selected shadcn preset command is `pnpm dlx shadcn@latest init --preset b2pl2jQxu --base base --template vite --pointer`. It uses the Vite template, Base UI primitives, the chosen preset code, and pointer styling. Because the app requires a custom monorepo structure, this command should be applied carefully inside the appropriate frontend workspace or adapted rather than allowing it to define the entire repository layout blindly.

## Question 81. If AcceptInsertText fails, should the buffer remain unchanged?

User answer:
yes

Agent context:
If AcceptInsertText fails, the buffer should remain unchanged. The app should show the proxy window on top for manual copy and show a toast/status message on the phone explaining that insertion failed.

## Question 82. Which Rust web framework should serve the phone PWA/API/WebSocket?

User answer:
recommended

Agent context:
The selected Rust web framework is axum. It is Tokio-native, has clean WebSocket support, fits a long-running service/control daemon well, and has a strong ecosystem. Alternatives considered included actix-web, poem, warp, and rocket.

## Question 83. Which encrypted storage approach should we choose?

User answer:
okay

Agent context:
The selected encrypted storage approach is SQLCipher with rusqlite/libsqlite3-sys if integration and packaging are workable. This matches the requirement for full SQLite database encryption. The install/build path must account for SQLCipher native dependencies.

## Question 84. What should the first implementation milestone be?

User answer:
Okay

Agent context:
The first implementation milestone should be a working local mock milestone. It should include the monorepo scaffold, Rust axum service, Tauri React PC UI, React/Vite phone PWA, Unix socket admin IPC adapter skeleton, mock input backend, encrypted DB unlock flow skeleton, one active phone session, live proxy buffer sync over WebSocket, phone buttons, and PC buttons. Real passkey registration, Tailscale Serve setup, KDE Wayland insertion, and real lock PC are deferred to later milestones.
