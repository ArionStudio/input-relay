use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RelayState {
    pub locked: bool,
    pub buffer: BufferState,
    pub active_session: Option<ActiveSession>,
    pub mock_device: Device,
    pub devices: Vec<Device>,
    pub registration: Option<RegistrationTicket>,
    pub backend: BackendStatus,
    pub network: NetworkStatus,
    pub history: HistoryState,
    pub last_notice: Option<Notice>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BufferState {
    pub text: String,
    pub selection: Selection,
    pub revision: u64,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Selection {
    pub start: usize,
    pub end: usize,
}

impl Selection {
    pub fn collapsed(position: usize) -> Self {
        Self {
            start: position,
            end: position,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActiveSession {
    pub device_id: String,
    pub device_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Device {
    pub id: String,
    pub name: String,
    pub verified: bool,
    pub permissions: DevicePermissions,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DevicePermissions {
    pub edit_buffer: bool,
    pub accept_insert_text: bool,
    pub clear_buffer: bool,
    pub show_proxy: bool,
    pub lock_pc: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegistrationTicket {
    pub code: String,
    pub expires_at_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkStatus {
    pub bind_host: String,
    pub relay_port: u16,
    pub phone_port: u16,
    pub relay_url: String,
    pub phone_url: String,
    pub reachable_from_phone: bool,
    pub tailscale: TailscaleStatus,
    pub notes: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TailscaleStatus {
    pub available: bool,
    pub running: bool,
    pub hostname: Option<String>,
    pub dns_name: Option<String>,
    pub ips: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackendStatus {
    pub id: String,
    pub label: String,
    pub mode: BackendMode,
    pub capabilities: BackendCapabilities,
    pub notes: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum BackendMode {
    Mock,
    Real,
    Unsupported,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackendCapabilities {
    pub can_insert_text: bool,
    pub can_write_clipboard: bool,
    pub can_paste_from_clipboard: bool,
    pub can_show_proxy: bool,
    pub can_lock_pc: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryState {
    pub mode: HistoryMode,
    pub limit: usize,
    pub entries: Vec<HistoryEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum HistoryMode {
    None,
    Last,
    All,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryEntry {
    pub id: Uuid,
    pub text: String,
    pub created_at_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Notice {
    pub id: Uuid,
    pub level: NoticeLevel,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum NoticeLevel {
    Info,
    Success,
    Warning,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum DesktopCommand {
    ShowProxy { id: Uuid },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientEnvelope {
    pub version: u16,
    pub device_id: Option<String>,
    pub action: ClientAction,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum ClientAction {
    SetText {
        text: String,
        selection: Selection,
    },
    ClearBuffer,
    AcceptInsertText {
        buffer_revision: u64,
    },
    AcceptDraftText {
        text: String,
        selection: Selection,
    },
    ShowProxy,
    LockPc,
    CreateRegistration {
        device_name: String,
    },
    RegisterDevice {
        code: String,
        device_id: String,
        device_name: String,
    },
    UpdatePermissions {
        permissions: DevicePermissions,
    },
    UpdateDevicePermissions {
        device_id: String,
        permissions: DevicePermissions,
    },
    UpdateHistorySettings {
        mode: HistoryMode,
        limit: usize,
    },
    Unlock {
        password: String,
    },
    LockApp,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum ServerEvent {
    State { state: RelayState },
    Notice { notice: Notice },
    DesktopCommand { command: DesktopCommand },
}
