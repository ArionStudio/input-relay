export type Selection = {
  /** UTF-16 code unit offset, matching textarea selectionStart/selectionEnd. */
  start: number;
  /** UTF-16 code unit offset, matching textarea selectionStart/selectionEnd. */
  end: number;
};

export type BufferState = {
  text: string;
  selection: Selection;
  revision: number;
};

export type DevicePermissions = {
  editBuffer: boolean;
  acceptInsertText: boolean;
  clearBuffer: boolean;
  showProxy: boolean;
  lockPc: boolean;
};

export type Device = {
  id: string;
  name: string;
  verified: boolean;
  permissions: DevicePermissions;
};

export type RegistrationTicket = {
  code: string;
  expiresAtMs: number;
};

export type TailscaleStatus = {
  available: boolean;
  running: boolean;
  hostname: string | null;
  dnsName: string | null;
  ips: string[];
};

export type NetworkStatus = {
  bindHost: string;
  relayPort: number;
  phonePort: number;
  relayUrl: string;
  phoneUrl: string;
  reachableFromPhone: boolean;
  tailscale: TailscaleStatus;
  notes: string[];
};

export type ActiveSession = {
  deviceId: string;
  deviceName: string;
};

export type BackendCapabilities = {
  canInsertText: boolean;
  canWriteClipboard: boolean;
  canPasteFromClipboard: boolean;
  canShowProxy: boolean;
  canLockPc: boolean;
};

export type BackendMode = "mock" | "real" | "unsupported";

export type BackendStatus = {
  id: string;
  label: string;
  mode: BackendMode;
  capabilities: BackendCapabilities;
  notes: string[];
};

export type HistoryMode = "none" | "last" | "all";

export type HistoryEntry = {
  id: string;
  text: string;
  createdAtMs: number;
};

export type HistoryState = {
  mode: HistoryMode;
  limit: number;
  entries: HistoryEntry[];
};

export type NoticeLevel = "info" | "success" | "warning" | "error";

export type Notice = {
  id: string;
  level: NoticeLevel;
  message: string;
};

export type DesktopCommand = {
  type: "showProxy";
  id: string;
};

export type RelayState = {
  locked: boolean;
  buffer: BufferState;
  activeSession: ActiveSession | null;
  mockDevice: Device;
  devices: Device[];
  registration: RegistrationTicket | null;
  backend: BackendStatus;
  network: NetworkStatus;
  history: HistoryState;
  lastNotice: Notice | null;
};

export type ClientAction =
  | {
      type: "setText";
      text: string;
      selection: Selection;
    }
  | {
      type: "clearBuffer";
    }
  | {
      type: "acceptInsertText";
      bufferRevision: number;
    }
  | {
      type: "acceptDraftText";
      text: string;
      selection: Selection;
    }
  | {
      type: "showProxy";
    }
  | {
      type: "lockPc";
    }
  | {
      type: "createRegistration";
      deviceName: string;
    }
  | {
      type: "registerDevice";
      code: string;
      deviceId: string;
      deviceName: string;
    }
  | {
      type: "updatePermissions";
      permissions: DevicePermissions;
    }
  | {
      type: "updateDevicePermissions";
      deviceId: string;
      permissions: DevicePermissions;
    }
  | {
      type: "updateHistorySettings";
      mode: HistoryMode;
      limit: number;
    }
  | {
      type: "unlock";
      password: string;
    }
  | {
      type: "lockApp";
    };

export type ClientEnvelope = {
  version: number;
  deviceId?: string;
  action: ClientAction;
};

export type ServerEvent =
  | {
      type: "state";
      state: RelayState;
    }
  | {
      type: "notice";
      notice: Notice;
    }
  | {
      type: "desktopCommand";
      command: DesktopCommand;
    };

export const MOCK_DEVICE_ID = "mock-phone";
