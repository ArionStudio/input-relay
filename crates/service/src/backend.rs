use std::{
    env,
    fs::OpenOptions,
    io::Write,
    path::Path,
    process::{Child, Command, ExitStatus, Stdio},
    sync::Arc,
    thread,
    time::{Duration, Instant},
};

use anyhow::{anyhow, Context, Result};
use evdev::{uinput::VirtualDevice, AttributeSet, EventType, InputEvent, KeyCode};
use input_relay_protocol::{BackendCapabilities, BackendMode, BackendStatus};
use parking_lot::Mutex;

const DEFAULT_CLIPBOARD_SETTLE_MS: u64 = 180;
const DEFAULT_WL_COPY_READY_TIMEOUT_MS: u64 = 250;
const CTRL_V_MODIFIER_SETTLE_MS: u64 = 6;
const CTRL_V_HOLD_MS: u64 = 12;
const CTRL_V_RELEASE_SETTLE_MS: u64 = 6;

#[derive(Clone)]
pub struct InputBackend {
    id: String,
    label: String,
    mode: BackendMode,
    capabilities: BackendCapabilities,
    notes: Vec<String>,
    lock_adapter: LockAdapter,
    clipboard_adapter: ClipboardAdapter,
    paste_adapter: PasteAdapter,
}

#[derive(Clone)]
enum LockAdapter {
    KdeScreenSaver { binary: String },
    Loginctl { binary: String },
    Unsupported,
}

#[derive(Clone)]
enum ClipboardAdapter {
    WlClipboard {
        copy_binary: String,
        paste_binary: String,
    },
    Unsupported,
}

#[derive(Clone)]
enum PasteAdapter {
    Uinput { device: Arc<Mutex<VirtualDevice>> },
    Unsupported,
}

pub struct InsertOutcome {
    pub message: String,
    pub verified: bool,
}

impl InputBackend {
    pub fn detect() -> Self {
        let session_type = env::var("XDG_SESSION_TYPE").unwrap_or_else(|_| "unknown".into());
        let desktop = env::var("XDG_CURRENT_DESKTOP").unwrap_or_else(|_| "unknown".into());
        let desktop_session = env::var("DESKTOP_SESSION").unwrap_or_else(|_| "unknown".into());

        let lock_adapter = detect_lock_adapter();
        let clipboard_adapter = detect_clipboard_adapter();
        let paste_adapter = detect_paste_adapter();
        let can_lock_pc = !matches!(lock_adapter, LockAdapter::Unsupported);
        let can_write_clipboard = !matches!(clipboard_adapter, ClipboardAdapter::Unsupported);
        let can_paste_from_clipboard = !matches!(paste_adapter, PasteAdapter::Unsupported);
        let can_insert_text = can_write_clipboard && can_paste_from_clipboard;

        let mut notes = vec![
            format!(
                "Detected session: {session_type}, desktop: {desktop}, session name: {desktop_session}."
            ),
        ];

        notes.push(match &lock_adapter {
            LockAdapter::KdeScreenSaver { binary } => {
                format!("LockPc adapter: KDE ScreenSaver DBus through {binary}.")
            }
            LockAdapter::Loginctl { binary } => {
                format!("LockPc adapter: systemd loginctl through {binary}.")
            }
            LockAdapter::Unsupported => "LockPc adapter: unsupported.".into(),
        });
        notes.push(match &clipboard_adapter {
            ClipboardAdapter::WlClipboard {
                copy_binary,
                paste_binary,
            } => {
                format!(
                    "Clipboard adapter: Wayland clipboard through {copy_binary}/{paste_binary}."
                )
            }
            ClipboardAdapter::Unsupported => "Clipboard adapter: unsupported.".into(),
        });
        notes.push(match &paste_adapter {
            PasteAdapter::Uinput { .. } => {
                "Paste trigger adapter: hot /dev/uinput virtual Ctrl+V.".into()
            }
            PasteAdapter::Unsupported => "Paste trigger adapter: unsupported.".into(),
        });

        let is_kde_wayland = session_type == "wayland"
            && (desktop.contains("KDE") || desktop_session.contains("plasma"));

        Self {
            id: if is_kde_wayland {
                "linux-kde-wayland".into()
            } else {
                "linux-detected".into()
            },
            label: if is_kde_wayland {
                "Linux KDE Wayland".into()
            } else {
                "Linux detected".into()
            },
            mode: if can_insert_text || can_lock_pc {
                BackendMode::Real
            } else {
                BackendMode::Unsupported
            },
            capabilities: BackendCapabilities {
                can_insert_text,
                can_write_clipboard,
                can_paste_from_clipboard,
                can_show_proxy: true,
                can_lock_pc,
            },
            notes,
            lock_adapter,
            clipboard_adapter,
            paste_adapter,
        }
    }

    pub fn status(&self) -> BackendStatus {
        BackendStatus {
            id: self.id.clone(),
            label: self.label.clone(),
            mode: self.mode.clone(),
            capabilities: self.capabilities.clone(),
            notes: self.notes.clone(),
        }
    }

    pub fn lock_pc(&self) -> Result<()> {
        match &self.lock_adapter {
            LockAdapter::KdeScreenSaver { binary } => {
                let status = Command::new(binary)
                    .args([
                        "org.freedesktop.ScreenSaver",
                        "/ScreenSaver",
                        "org.freedesktop.ScreenSaver.Lock",
                    ])
                    .status()
                    .context("failed to run KDE ScreenSaver lock command")?;

                if status.success() {
                    Ok(())
                } else {
                    Err(anyhow!("KDE ScreenSaver lock command exited with {status}"))
                }
            }
            LockAdapter::Loginctl { binary } => {
                let status = Command::new(binary)
                    .arg("lock-session")
                    .status()
                    .context("failed to run loginctl lock-session")?;

                if status.success() {
                    Ok(())
                } else {
                    Err(anyhow!("loginctl lock-session exited with {status}"))
                }
            }
            LockAdapter::Unsupported => Err(anyhow!("LockPc is unsupported on this environment")),
        }
    }

    pub fn accept_insert_text(&self, text: &str) -> Result<InsertOutcome> {
        if text.is_empty() {
            return Err(anyhow!("nothing to insert"));
        }

        self.write_clipboard_for_paste(text)?;
        thread::sleep(Duration::from_millis(env_u64(
            "INPUT_RELAY_CLIPBOARD_SETTLE_MS",
            DEFAULT_CLIPBOARD_SETTLE_MS,
        )));
        self.trigger_paste()?;

        Ok(InsertOutcome {
            message: "Paste shortcut sent to the currently focused input. Wayland does not confirm whether the target accepted it, so the buffer was kept and the text remains on the clipboard.".into(),
            verified: false,
        })
    }

    fn write_clipboard_for_paste(&self, text: &str) -> Result<()> {
        match &self.clipboard_adapter {
            ClipboardAdapter::WlClipboard { copy_binary, .. } => {
                let mut child = Command::new(copy_binary)
                    .args(["--type", "text/plain;charset=utf-8"])
                    .stdin(Stdio::piped())
                    .stdout(Stdio::null())
                    .stderr(Stdio::null())
                    .spawn()
                    .context("failed to run wl-copy")?;

                let mut stdin = child
                    .stdin
                    .take()
                    .ok_or_else(|| anyhow!("failed to open wl-copy stdin"))?;
                stdin
                    .write_all(text.as_bytes())
                    .context("failed to write text to wl-copy")?;
                drop(stdin);

                match wait_for_child_exit(
                    &mut child,
                    Duration::from_millis(env_u64(
                        "INPUT_RELAY_WL_COPY_READY_TIMEOUT_MS",
                        DEFAULT_WL_COPY_READY_TIMEOUT_MS,
                    )),
                )? {
                    Some(status) if !status.success() => {
                        return Err(anyhow!("wl-copy exited with {status}"));
                    }
                    Some(_) => {}
                    None => {
                        thread::spawn(move || {
                            let _ = child.wait();
                        });
                    }
                }

                Ok(())
            }
            ClipboardAdapter::Unsupported => Err(anyhow!("clipboard write is unsupported")),
        }
    }

    fn trigger_paste(&self) -> Result<()> {
        match &self.paste_adapter {
            PasteAdapter::Uinput { device } => {
                let mut device = device.lock();
                trigger_ctrl_v_with_uinput(&mut device)
            }
            PasteAdapter::Unsupported => Err(anyhow!("paste trigger is unsupported")),
        }
    }
}

fn detect_lock_adapter() -> LockAdapter {
    for binary in ["qdbus6", "qdbus"] {
        if command_exists(binary) && kde_screensaver_available(binary) {
            return LockAdapter::KdeScreenSaver {
                binary: binary.into(),
            };
        }
    }

    if command_exists("loginctl") {
        return LockAdapter::Loginctl {
            binary: "loginctl".into(),
        };
    }

    LockAdapter::Unsupported
}

fn detect_clipboard_adapter() -> ClipboardAdapter {
    if command_exists("wl-copy") && command_exists("wl-paste") {
        ClipboardAdapter::WlClipboard {
            copy_binary: "wl-copy".into(),
            paste_binary: "wl-paste".into(),
        }
    } else {
        ClipboardAdapter::Unsupported
    }
}

fn detect_paste_adapter() -> PasteAdapter {
    let path = Path::new("/dev/uinput");
    if path.exists() && OpenOptions::new().write(true).open(path).is_ok() {
        match create_uinput_paste_device() {
            Ok(device) => PasteAdapter::Uinput {
                device: Arc::new(Mutex::new(device)),
            },
            Err(_) => PasteAdapter::Unsupported,
        }
    } else {
        PasteAdapter::Unsupported
    }
}

fn kde_screensaver_available(binary: &str) -> bool {
    Command::new(binary)
        .args([
            "org.freedesktop.ScreenSaver",
            "/ScreenSaver",
            "org.freedesktop.ScreenSaver.GetActive",
        ])
        .output()
        .map(|output| output.status.success())
        .unwrap_or(false)
}

fn command_exists(command: &str) -> bool {
    Command::new("sh")
        .arg("-c")
        .arg(format!("command -v {command} >/dev/null 2>&1"))
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
}

fn create_uinput_paste_device() -> Result<VirtualDevice> {
    let mut keys = AttributeSet::<KeyCode>::new();
    keys.insert(KeyCode::KEY_LEFTCTRL);
    keys.insert(KeyCode::KEY_V);

    VirtualDevice::builder()
        .context("failed to create uinput device builder")?
        .name("input-relay-paste")
        .with_keys(&keys)
        .context("failed to set uinput key capabilities")?
        .build()
        .context("failed to create uinput paste device")
}

fn trigger_ctrl_v_with_uinput(device: &mut VirtualDevice) -> Result<()> {
    device
        .emit(&[key_event(KeyCode::KEY_LEFTCTRL, 1)])
        .context("failed to press Ctrl through uinput")?;
    thread::sleep(Duration::from_millis(CTRL_V_MODIFIER_SETTLE_MS));
    device
        .emit(&[key_event(KeyCode::KEY_V, 1)])
        .context("failed to press V through uinput")?;
    thread::sleep(Duration::from_millis(CTRL_V_HOLD_MS));
    device
        .emit(&[key_event(KeyCode::KEY_V, 0)])
        .context("failed to release V through uinput")?;
    thread::sleep(Duration::from_millis(CTRL_V_RELEASE_SETTLE_MS));
    device
        .emit(&[key_event(KeyCode::KEY_LEFTCTRL, 0)])
        .context("failed to release Ctrl through uinput")?;

    Ok(())
}

fn env_u64(key: &str, default: u64) -> u64 {
    env::var(key)
        .ok()
        .and_then(|value| value.parse::<u64>().ok())
        .unwrap_or(default)
}

fn key_event(key: KeyCode, value: i32) -> InputEvent {
    InputEvent::new(EventType::KEY.0, key.code(), value)
}

fn wait_for_child_exit(child: &mut Child, timeout: Duration) -> Result<Option<ExitStatus>> {
    let started_at = Instant::now();

    loop {
        if let Some(status) = child.try_wait().context("failed to poll wl-copy")? {
            return Ok(Some(status));
        }

        if started_at.elapsed() >= timeout {
            return Ok(None);
        }

        thread::sleep(Duration::from_millis(5));
    }
}
