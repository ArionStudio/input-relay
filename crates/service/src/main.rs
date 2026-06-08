use std::{
    env,
    net::{IpAddr, SocketAddr},
    sync::Arc,
    time::{SystemTime, UNIX_EPOCH},
};

use anyhow::Context;
use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        State,
    },
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use backend::InputBackend;
use futures_util::{SinkExt, StreamExt};
use input_relay_protocol::{
    ActiveSession, BufferState, ClientAction, ClientEnvelope, DesktopCommand, Device,
    DevicePermissions, HistoryEntry, HistoryMode, HistoryState, Notice, NoticeLevel,
    RegistrationTicket, RelayState, Selection, ServerEvent,
};
use keychain::Keychain;
use parking_lot::{Mutex, RwLock};
use storage::{PersistentState, Storage};
use tokio::sync::broadcast;
use tower_http::cors::CorsLayer;
use tracing::{debug, info, warn};
use uuid::Uuid;

mod backend;
mod keychain;
mod network;
mod storage;

const DESKTOP_DEVICE_ID: &str = "desktop";
const REGISTRATION_TTL_MS: u64 = 10 * 60 * 1000;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            env::var("RUST_LOG")
                .unwrap_or_else(|_| "input_relay_service=info,tower_http=info".into()),
        )
        .init();

    let port = env::var("INPUT_RELAY_PORT")
        .ok()
        .and_then(|value| value.parse::<u16>().ok())
        .unwrap_or(4317);
    let phone_port = env::var("INPUT_RELAY_PHONE_PORT")
        .ok()
        .and_then(|value| value.parse::<u16>().ok())
        .unwrap_or(5174);
    let host = env::var("INPUT_RELAY_HOST")
        .ok()
        .and_then(|value| value.parse::<IpAddr>().ok())
        .unwrap_or_else(|| IpAddr::from([127, 0, 0, 1]));
    let addr = SocketAddr::from((host, port));
    let state = AppState::new(host, port, phone_port)?;

    let app = Router::new()
        .route("/health", get(health))
        .route("/api/state", get(get_state))
        .route("/api/actions", post(post_action))
        .route("/ws", get(ws_handler))
        .layer(CorsLayer::permissive())
        .with_state(state);

    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .with_context(|| format!("failed to bind relay service on {addr}"))?;

    info!("input relay service listening on http://{addr}");
    axum::serve(listener, app).await?;
    Ok(())
}

#[derive(Clone)]
struct AppState {
    inner: Arc<RwLock<RelayState>>,
    storage: Arc<Mutex<Storage>>,
    keychain: Arc<Keychain>,
    backend: Arc<InputBackend>,
    events: broadcast::Sender<ServerEvent>,
}

impl AppState {
    fn new(bind_host: IpAddr, relay_port: u16, phone_port: u16) -> anyhow::Result<Self> {
        let (events, _) = broadcast::channel(64);
        let mut storage = Storage::new()?;
        let keychain = Keychain::detect();
        let backend = InputBackend::detect();
        let network = network::detect(bind_host, relay_port, phone_port);
        info!(
            database_path = %storage.database_path().display(),
            "encrypted storage configured"
        );
        info!(
            adapter = keychain.label(),
            available = keychain.available(),
            "keychain adapter detected"
        );

        let mut state = initial_state();
        state.backend = backend.status();
        state.network = network;
        state
            .backend
            .notes
            .push(format!("Keychain adapter: {}.", keychain.label()));
        if let Some(reason) = keychain.unavailable_reason() {
            state
                .backend
                .notes
                .push(format!("Keychain unavailable: {reason}."));
        }

        match keychain.load_password() {
            Ok(Some(password)) => match storage.unlock(&password) {
                Ok(persistent) => {
                    apply_persistent_state(&mut state, persistent);
                    state.locked = false;
                    state.last_notice = Some(notice(
                        NoticeLevel::Success,
                        "Relay auto-unlocked from OS keychain.",
                    ));
                }
                Err(error) => {
                    warn!(?error, "stored keychain password failed to unlock database");
                    storage.lock();
                }
            },
            Ok(None) => {}
            Err(error) => {
                warn!(?error, "failed to load app password from keychain");
            }
        }

        Ok(Self {
            inner: Arc::new(RwLock::new(state)),
            storage: Arc::new(Mutex::new(storage)),
            keychain: Arc::new(keychain),
            backend: Arc::new(backend),
            events,
        })
    }

    fn snapshot(&self) -> RelayState {
        sanitize_snapshot(self.inner.read().clone())
    }

    fn publish_state(&self) {
        let state = self.snapshot();
        let _ = self.events.send(ServerEvent::State { state });
    }

    fn apply(&self, envelope: ClientEnvelope) {
        let mut desktop_commands = Vec::new();
        let notice = {
            let mut state = self.inner.write();
            let mut storage = self.storage.lock();
            apply_action(
                &mut state,
                &mut storage,
                &self.keychain,
                &self.backend,
                &mut desktop_commands,
                envelope,
            )
            .unwrap_or_else(|error| Some(notice(NoticeLevel::Error, error.to_string())))
        };

        if let Some(notice) = notice {
            {
                let mut state = self.inner.write();
                state.last_notice = Some(notice.clone());
            }
            let _ = self.events.send(ServerEvent::Notice { notice });
        }

        for command in desktop_commands {
            let _ = self.events.send(ServerEvent::DesktopCommand { command });
        }

        self.publish_state();
    }
}

fn sanitize_snapshot(mut state: RelayState) -> RelayState {
    if state.locked {
        state.buffer.text.clear();
        state.buffer.selection = Selection::collapsed(0);
        state.active_session = None;
        state.history.entries.clear();
        state.devices.clear();
        state.registration = None;
        state.mock_device = locked_device_placeholder();
    }

    state
}

fn initial_state() -> RelayState {
    RelayState {
        locked: true,
        buffer: BufferState {
            text: String::new(),
            selection: Selection::collapsed(0),
            revision: 0,
        },
        active_session: None,
        mock_device: unregistered_device_placeholder(),
        devices: Vec::new(),
        registration: None,
        backend: InputBackend::detect().status(),
        network: network::detect(IpAddr::from([127, 0, 0, 1]), 4317, 5174),
        history: HistoryState {
            mode: HistoryMode::None,
            limit: 10,
            entries: Vec::new(),
        },
        last_notice: None,
    }
}

fn locked_device_placeholder() -> Device {
    Device {
        id: "locked".into(),
        name: "Locked".into(),
        verified: false,
        permissions: DevicePermissions::default(),
    }
}

fn apply_action(
    state: &mut RelayState,
    storage: &mut Storage,
    keychain: &Keychain,
    backend: &InputBackend,
    desktop_commands: &mut Vec<DesktopCommand>,
    envelope: ClientEnvelope,
) -> anyhow::Result<Option<Notice>> {
    let device_id = envelope.device_id.as_deref().unwrap_or("").to_string();
    let is_desktop = device_id == DESKTOP_DEVICE_ID;

    if state.locked {
        return Ok(match envelope.action {
            ClientAction::Unlock { password } if is_desktop => {
                if password.trim().is_empty() {
                    Some(notice(
                        NoticeLevel::Error,
                        "Unlock password cannot be empty.",
                    ))
                } else {
                    let persistent = storage.unlock(&password)?;
                    apply_persistent_state(state, persistent);
                    state.locked = false;
                    let keychain_message = if keychain.available() {
                        match keychain.store_password(&password) {
                            Ok(()) => " OS keychain unlock is enabled.",
                            Err(error) => {
                                warn!(?error, "failed to store app password in keychain");
                                " OS keychain save failed; manual password unlock remains available."
                            }
                        }
                    } else {
                        " OS keychain is unavailable; manual password unlock remains available."
                    };
                    Some(notice(
                        NoticeLevel::Success,
                        format!("Relay unlocked with encrypted storage.{keychain_message}"),
                    ))
                }
            }
            _ => Some(notice(
                NoticeLevel::Warning,
                "Relay is locked. Unlock from the PC UI before using phone actions.",
            )),
        });
    }

    Ok(match envelope.action {
        ClientAction::Unlock { .. } if is_desktop => {
            Some(notice(NoticeLevel::Info, "Relay is already unlocked."))
        }
        ClientAction::LockApp if is_desktop => {
            storage.lock();
            state.locked = true;
            state.buffer.text.clear();
            state.buffer.selection = Selection::collapsed(0);
            state.buffer.revision += 1;
            state.active_session = None;
            state.history.entries.clear();
            state.registration = None;
            Some(notice(NoticeLevel::Info, "Relay locked and buffer hidden."))
        }
        ClientAction::SetText { text, selection } => {
            let phone = if is_desktop {
                None
            } else {
                Some(match registered_device(state, &device_id) {
                    Some(device) => device,
                    None => return Ok(Some(unregistered_notice())),
                })
            };
            if let Some(device) = &phone {
                if !device.permissions.edit_buffer {
                    return Ok(Some(permission_notice("editBuffer")));
                }
            }
            if let Some(device) = &phone {
                if !claim_active_session(state, &device.id, &device.name) {
                    return Ok(Some(notice(
                        NoticeLevel::Warning,
                        "Another device already owns the active session.",
                    )));
                }
            }
            let bounded_selection = bound_selection(&text, selection);
            state.buffer.text = text;
            state.buffer.selection = bounded_selection;
            state.buffer.revision += 1;
            None
        }
        ClientAction::ClearBuffer => {
            if !is_desktop {
                let Some(device) = registered_device(state, &device_id) else {
                    return Ok(Some(unregistered_notice()));
                };
                if !device.permissions.clear_buffer {
                    return Ok(Some(permission_notice("clearBuffer")));
                }
            }
            state.buffer.text.clear();
            state.buffer.selection = Selection::collapsed(0);
            state.buffer.revision += 1;
            Some(notice(NoticeLevel::Info, "Buffer cleared."))
        }
        ClientAction::AcceptInsertText { buffer_revision } => {
            if !is_desktop {
                let Some(device) = registered_device(state, &device_id) else {
                    return Ok(Some(unregistered_notice()));
                };
                if !device.permissions.accept_insert_text {
                    return Ok(Some(permission_notice("acceptInsertText")));
                }
            }
            if buffer_revision != state.buffer.revision {
                return Ok(Some(notice(
                    NoticeLevel::Warning,
                    "Accept ignored because the phone was behind the latest buffer revision.",
                )));
            }
            accept_current_buffer(state, storage, backend, desktop_commands)?
        }
        ClientAction::AcceptDraftText { text, selection } => {
            if !is_desktop {
                let Some(device) = registered_device(state, &device_id) else {
                    return Ok(Some(unregistered_notice()));
                };
                if !device.permissions.edit_buffer {
                    return Ok(Some(permission_notice("editBuffer")));
                }
                if !device.permissions.accept_insert_text {
                    return Ok(Some(permission_notice("acceptInsertText")));
                }
                if !claim_active_session(state, &device.id, &device.name) {
                    return Ok(Some(notice(
                        NoticeLevel::Warning,
                        "Another device already owns the active session.",
                    )));
                }
            }

            let bounded_selection = bound_selection(&text, selection);
            state.buffer.text = text;
            state.buffer.selection = bounded_selection;
            state.buffer.revision += 1;

            accept_current_buffer(state, storage, backend, desktop_commands)?
        }
        ClientAction::ShowProxy => {
            if !is_desktop {
                let Some(device) = registered_device(state, &device_id) else {
                    return Ok(Some(unregistered_notice()));
                };
                if !device.permissions.show_proxy {
                    return Ok(Some(permission_notice("showProxy")));
                }
            }
            desktop_commands.push(DesktopCommand::ShowProxy { id: Uuid::new_v4() });
            Some(notice(
                NoticeLevel::Success,
                "Proxy window requested on the desktop.",
            ))
        }
        ClientAction::LockPc => {
            if !is_desktop {
                let Some(device) = registered_device(state, &device_id) else {
                    return Ok(Some(unregistered_notice()));
                };
                if !device.permissions.lock_pc {
                    return Ok(Some(permission_notice("lockPc")));
                }
            }
            backend.lock_pc()?;
            Some(notice(
                NoticeLevel::Success,
                "LockPc command sent to the system session.",
            ))
        }
        ClientAction::CreateRegistration { device_name } if is_desktop => {
            let ticket = RegistrationTicket {
                code: registration_code(),
                expires_at_ms: now_ms().saturating_add(REGISTRATION_TTL_MS),
            };
            state.registration = Some(ticket);
            Some(notice(
                NoticeLevel::Success,
                format!(
                    "Registration opened for {}.",
                    clean_device_name(&device_name)
                ),
            ))
        }
        ClientAction::RegisterDevice {
            code,
            device_id,
            device_name,
        } => {
            if device_id.trim().is_empty() || device_id == DESKTOP_DEVICE_ID {
                return Ok(Some(notice(
                    NoticeLevel::Error,
                    "Registration requires a phone device id.",
                )));
            }
            let Some(ticket) = state.registration.clone() else {
                return Ok(Some(notice(
                    NoticeLevel::Error,
                    "No phone registration is open on the PC.",
                )));
            };
            if now_ms() > ticket.expires_at_ms {
                state.registration = None;
                return Ok(Some(notice(
                    NoticeLevel::Error,
                    "Registration code expired. Start a new registration from the PC.",
                )));
            }
            if code.trim() != ticket.code {
                return Ok(Some(notice(
                    NoticeLevel::Error,
                    "Registration code did not match the PC registration.",
                )));
            }

            let device = Device {
                id: device_id,
                name: clean_device_name(&device_name),
                verified: true,
                permissions: default_phone_permissions(),
            };
            storage.save_device(&device)?;
            upsert_device(state, device);
            state.registration = None;
            sync_legacy_device(state);
            Some(notice(
                NoticeLevel::Success,
                "Phone registered. Configure permissions from the PC.",
            ))
        }
        ClientAction::UpdatePermissions { permissions } if is_desktop => {
            let Some(device_id) = state.devices.first().map(|device| device.id.clone()) else {
                return Ok(Some(notice(
                    NoticeLevel::Warning,
                    "No phone device is registered yet.",
                )));
            };
            update_device_permissions(state, storage, &device_id, permissions)?;
            Some(notice(NoticeLevel::Success, "Device permissions updated."))
        }
        ClientAction::UpdateDevicePermissions {
            device_id,
            permissions,
        } if is_desktop => {
            update_device_permissions(state, storage, &device_id, permissions)?;
            Some(notice(NoticeLevel::Success, "Device permissions updated."))
        }
        ClientAction::UpdateHistorySettings { mode, limit } if is_desktop => {
            state.history.mode = mode;
            state.history.limit = limit.clamp(1, 500);
            storage.save_history_settings(&state.history.mode, state.history.limit)?;
            trim_history(state);
            Some(notice(NoticeLevel::Success, "History settings updated."))
        }
        ClientAction::CreateRegistration { .. }
        | ClientAction::UpdatePermissions { .. }
        | ClientAction::UpdateDevicePermissions { .. }
        | ClientAction::UpdateHistorySettings { .. } => Some(notice(
            NoticeLevel::Error,
            "Only the PC admin UI can update settings.",
        )),
        ClientAction::Unlock { .. } | ClientAction::LockApp => Some(notice(
            NoticeLevel::Error,
            "Only the PC admin UI can lock or unlock the relay.",
        )),
    })
}

fn accept_current_buffer(
    state: &mut RelayState,
    storage: &Storage,
    backend: &InputBackend,
    desktop_commands: &mut Vec<DesktopCommand>,
) -> anyhow::Result<Option<Notice>> {
    if state.buffer.text.is_empty() {
        return Ok(Some(notice(NoticeLevel::Warning, "Nothing to insert.")));
    }

    let outcome = match backend.accept_insert_text(&state.buffer.text) {
        Ok(outcome) => outcome,
        Err(error) => {
            desktop_commands.push(DesktopCommand::ShowProxy { id: Uuid::new_v4() });
            return Ok(Some(notice(
                NoticeLevel::Error,
                format!("Insert failed: {error}. Proxy window requested for manual copy."),
            )));
        }
    };
    if !outcome.verified {
        return Ok(Some(notice(NoticeLevel::Warning, outcome.message)));
    }

    let history_result = record_history(state, storage);
    state.buffer.text.clear();
    state.buffer.selection = Selection::collapsed(0);
    state.buffer.revision += 1;
    let mut message = outcome.message;
    if let Err(error) = history_result {
        warn!(
            ?error,
            "failed to record history after successful text insert"
        );
        message.push_str(" Insert succeeded, but history could not be saved to encrypted storage.");
    }
    Ok(Some(notice(NoticeLevel::Success, message)))
}

fn apply_persistent_state(state: &mut RelayState, persistent: PersistentState) {
    state.devices = persistent.devices;
    sync_legacy_device(state);
    state.history = persistent.history;
}

fn claim_active_session(state: &mut RelayState, device_id: &str, device_name: &str) -> bool {
    match &state.active_session {
        Some(active) if active.device_id != device_id => false,
        Some(_) => true,
        None => {
            state.active_session = Some(ActiveSession {
                device_id: device_id.into(),
                device_name: device_name.into(),
            });
            true
        }
    }
}

fn registered_device(state: &RelayState, device_id: &str) -> Option<Device> {
    state
        .devices
        .iter()
        .find(|device| device.id == device_id && device.verified)
        .cloned()
}

fn upsert_device(state: &mut RelayState, device: Device) {
    match state
        .devices
        .iter_mut()
        .find(|existing| existing.id == device.id)
    {
        Some(existing) => *existing = device,
        None => state.devices.push(device),
    }
    state
        .devices
        .sort_by(|left, right| left.name.cmp(&right.name));
}

fn update_device_permissions(
    state: &mut RelayState,
    storage: &Storage,
    device_id: &str,
    permissions: DevicePermissions,
) -> anyhow::Result<()> {
    storage.save_permissions(device_id, &permissions)?;
    let Some(device) = state
        .devices
        .iter_mut()
        .find(|device| device.id == device_id)
    else {
        anyhow::bail!("device {device_id} was not found");
    };
    device.permissions = permissions;
    sync_legacy_device(state);
    Ok(())
}

fn sync_legacy_device(state: &mut RelayState) {
    state.mock_device = state
        .devices
        .first()
        .cloned()
        .unwrap_or_else(unregistered_device_placeholder);
}

fn unregistered_device_placeholder() -> Device {
    Device {
        id: "unregistered".into(),
        name: "No phone registered".into(),
        verified: false,
        permissions: DevicePermissions::default(),
    }
}

fn default_phone_permissions() -> DevicePermissions {
    DevicePermissions {
        edit_buffer: true,
        accept_insert_text: false,
        clear_buffer: false,
        show_proxy: false,
        lock_pc: false,
    }
}

fn clean_device_name(name: &str) -> String {
    let cleaned = name.trim();
    if cleaned.is_empty() {
        "Phone".into()
    } else {
        cleaned.chars().take(80).collect()
    }
}

fn registration_code() -> String {
    Uuid::new_v4().simple().to_string()
}

fn bound_selection(text: &str, selection: Selection) -> Selection {
    let len = text.len();
    Selection {
        start: selection.start.min(len),
        end: selection.end.min(len),
    }
}

fn record_history(state: &mut RelayState, storage: &Storage) -> anyhow::Result<()> {
    if matches!(state.history.mode, HistoryMode::None) {
        return Ok(());
    }

    let entry = HistoryEntry {
        id: Uuid::new_v4(),
        text: state.buffer.text.clone(),
        created_at_ms: now_ms(),
    };

    storage.add_history_entry(&entry, &state.history.mode, state.history.limit)?;
    state.history.entries.insert(0, entry);
    trim_history(state);
    Ok(())
}

fn trim_history(state: &mut RelayState) {
    if matches!(state.history.mode, HistoryMode::Last) {
        state.history.entries.truncate(state.history.limit);
    }
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .try_into()
        .unwrap_or(u64::MAX)
}

fn permission_notice(permission: &str) -> Notice {
    notice(
        NoticeLevel::Error,
        format!("This device does not have {permission} permission."),
    )
}

fn unregistered_notice() -> Notice {
    notice(
        NoticeLevel::Error,
        "This phone is not registered. Start registration from the PC.",
    )
}

fn notice(level: NoticeLevel, message: impl Into<String>) -> Notice {
    Notice {
        id: Uuid::new_v4(),
        level,
        message: message.into(),
    }
}

async fn health() -> impl IntoResponse {
    Json(serde_json::json!({
        "ok": true,
        "service": "input-relay",
        "mode": "relay"
    }))
}

async fn get_state(State(state): State<AppState>) -> impl IntoResponse {
    Json(state.snapshot())
}

async fn post_action(
    State(state): State<AppState>,
    Json(envelope): Json<ClientEnvelope>,
) -> impl IntoResponse {
    debug!(?envelope, "applying relay action");
    state.apply(envelope);
    (StatusCode::ACCEPTED, Json(state.snapshot()))
}

async fn ws_handler(ws: WebSocketUpgrade, State(state): State<AppState>) -> impl IntoResponse {
    ws.on_upgrade(move |socket| websocket(socket, state))
}

async fn websocket(socket: WebSocket, state: AppState) {
    let (mut sender, mut receiver) = socket.split();
    let initial = ServerEvent::State {
        state: state.snapshot(),
    };

    if let Ok(text) = serde_json::to_string(&initial) {
        if sender.send(Message::Text(text.into())).await.is_err() {
            return;
        }
    }

    let mut events = state.events.subscribe();
    let state_for_receive = state.clone();

    let send_task = tokio::spawn(async move {
        while let Ok(event) = events.recv().await {
            let text = match serde_json::to_string(&event) {
                Ok(text) => text,
                Err(error) => {
                    warn!(?error, "failed to serialize websocket event");
                    continue;
                }
            };
            if sender.send(Message::Text(text.into())).await.is_err() {
                break;
            }
        }
    });

    let receive_task = tokio::spawn(async move {
        while let Some(message) = receiver.next().await {
            match message {
                Ok(Message::Text(text)) => match serde_json::from_str::<ClientEnvelope>(&text) {
                    Ok(envelope) => state_for_receive.apply(envelope),
                    Err(error) => warn!(?error, "received invalid client envelope"),
                },
                Ok(Message::Close(_)) => break,
                Ok(_) => {}
                Err(error) => {
                    warn!(?error, "websocket receive error");
                    break;
                }
            }
        }
    });

    tokio::select! {
        _ = send_task => {}
        _ = receive_task => {}
    }
}
