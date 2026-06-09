import * as React from "react";
import type {
  BackendStatus,
  Device,
  DevicePermissions,
  HistoryMode,
  HistoryState,
  NetworkStatus,
} from "@input-relay/protocol";
import { getRelayHttpUrl, useRelay } from "@input-relay/relay-client";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { QRCodeSVG } from "qrcode.react";
import {
  Badge,
  Button,
  Input,
  Panel,
  PanelDescription,
  PanelHeader,
  PanelTitle,
  Switch,
  Textarea,
} from "@input-relay/ui";
import {
  CheckCircle2,
  Clipboard,
  Database,
  KeyRound,
  Lock,
  MonitorUp,
  PanelTopOpen,
  Settings,
  ShieldCheck,
  Trash2,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";

const DESKTOP_DEVICE_ID = "desktop";

type DesktopPanel = "proxy" | "devices" | "settings";

export function App() {
  const { state, notice, desktopCommand, connected, sendAction } =
    useRelay(DESKTOP_DEVICE_ID);
  const [password, setPassword] = React.useState("");
  const [draft, setDraft] = React.useState("");
  const [activePanel, setActivePanel] = React.useState<DesktopPanel>("proxy");
  const [localMessage, setLocalMessage] = React.useState<string | null>(null);
  const [selectedDeviceId, setSelectedDeviceId] = React.useState("");
  const [registrationDeviceName, setRegistrationDeviceName] =
    React.useState("iPhone");
  const proxyTextareaRef = React.useRef<HTMLTextAreaElement | null>(null);
  const pendingDraftTextRef = React.useRef<string | null>(null);
  const devicesKey = state?.devices.map((device) => device.id).join("|") ?? "";
  const selectedDevice =
    state?.devices.find((device) => device.id === selectedDeviceId) ??
    state?.devices[0] ??
    null;

  React.useEffect(() => {
    if (!state || state.locked) {
      return;
    }

    const pendingDraftText = pendingDraftTextRef.current;
    if (pendingDraftText !== null) {
      if (state.buffer.text !== pendingDraftText) {
        return;
      }
      pendingDraftTextRef.current = null;
    }

    if (draft !== state.buffer.text) {
      setDraft(state.buffer.text);
    }
  }, [draft, state?.buffer.revision, state?.buffer.text, state?.locked]);

  React.useEffect(() => {
    if (!state || state.locked) {
      return;
    }
    if (!state.devices.some((device) => device.id === selectedDeviceId)) {
      setSelectedDeviceId(state.devices[0]?.id ?? "");
    }
  }, [devicesKey, selectedDeviceId, state?.locked]);

  React.useEffect(() => {
    if (!notice) {
      return;
    }
    setLocalMessage(notice.message);
    const timeout = window.setTimeout(() => setLocalMessage(null), 2800);
    return () => window.clearTimeout(timeout);
  }, [notice?.id]);

  React.useEffect(() => {
    if (!desktopCommand || desktopCommand.type !== "showProxy") {
      return;
    }

    setActivePanel("proxy");
    void showProxyWindow()
      .then(() => {
        window.setTimeout(() => proxyTextareaRef.current?.focus(), 80);
      })
      .catch((error) => {
        setLocalMessage(error instanceof Error ? error.message : String(error));
      });
  }, [desktopCommand?.id]);

  const send = (action: Parameters<typeof sendAction>[0]) => {
    void sendAction(action).catch((error) => {
      setLocalMessage(error instanceof Error ? error.message : String(error));
    });
  };

  const unlock = (event: React.FormEvent) => {
    event.preventDefault();
    send({ type: "unlock", password });
    setPassword("");
  };

  const updateText = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const next = event.currentTarget.value;
    const selection = {
      start: event.currentTarget.selectionStart,
      end: event.currentTarget.selectionEnd,
    };
    pendingDraftTextRef.current = next;
    setDraft(next);
    void sendAction({
      type: "setText",
      text: next,
      selection,
    }).catch((error) => {
      if (pendingDraftTextRef.current === next) {
        pendingDraftTextRef.current = null;
      }
      setLocalMessage(error instanceof Error ? error.message : String(error));
    });
  };

  const updatePermission = (key: keyof DevicePermissions, value: boolean) => {
    if (!selectedDevice) {
      return;
    }
    send({
      type: "updateDevicePermissions",
      deviceId: selectedDevice.id,
      permissions: {
        ...selectedDevice.permissions,
        [key]: value,
      },
    });
  };

  const createRegistration = () => {
    send({
      type: "createRegistration",
      deviceName: registrationDeviceName,
    });
  };

  const updateHistory = (
    mode: HistoryMode,
    limit = state?.history.limit ?? 10,
  ) => {
    send({
      type: "updateHistorySettings",
      mode,
      limit,
    });
  };

  const copyBuffer = async () => {
    if (!state?.buffer.text) {
      setLocalMessage("Buffer is empty.");
      return;
    }
    if (!navigator.clipboard) {
      setLocalMessage("Clipboard access is not available in this environment.");
      return;
    }

    try {
      await navigator.clipboard.writeText(state.buffer.text);
      setLocalMessage("Buffer copied locally from the desktop UI.");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("failed to copy relay buffer", error);
      setLocalMessage(`Failed to copy to clipboard: ${message}`);
    }
  };

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="flex min-h-16 items-center justify-between border-b border-border px-5">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-muted">
            <MonitorUp className="h-4 w-4 text-muted-foreground" />
          </div>
          <div>
            <h1 className="text-base font-semibold leading-5">Input Relay</h1>
            <p className="text-xs text-muted-foreground">Desktop control UI</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={connected ? "good" : "danger"}>
            {connected ? (
              <Wifi className="mr-1.5 h-3.5 w-3.5" />
            ) : (
              <WifiOff className="mr-1.5 h-3.5 w-3.5" />
            )}
            {connected ? "Service connected" : "Service offline"}
          </Badge>
          <Badge tone={state?.locked ? "warn" : "good"}>
            {state?.locked ? "Locked" : "Unlocked"}
          </Badge>
        </div>
      </header>

      <div className="grid min-h-[calc(100vh-4rem)] grid-cols-[220px_1fr]">
        <aside className="border-r border-border bg-background px-3 py-4">
          <nav className="grid gap-1">
            <NavButton
              active={activePanel === "proxy"}
              icon={<PanelTopOpen />}
              onClick={() => setActivePanel("proxy")}
            >
              Proxy
            </NavButton>
            <NavButton
              active={activePanel === "devices"}
              icon={<KeyRound />}
              onClick={() => setActivePanel("devices")}
            >
              Devices
            </NavButton>
            <NavButton
              active={activePanel === "settings"}
              icon={<Settings />}
              onClick={() => setActivePanel("settings")}
            >
              Settings
            </NavButton>
          </nav>
        </aside>

        <section className="px-5 py-5">
          {!state || state.locked ? (
            <UnlockPanel
              connected={connected}
              password={password}
              setPassword={setPassword}
              unlock={unlock}
            />
          ) : (
            <>
              {activePanel === "proxy" ? (
                <ProxyPanel
                  draft={draft}
                  revision={state.buffer.revision}
                  updateText={updateText}
                  clear={() => send({ type: "clearBuffer" })}
                  copy={copyBuffer}
                  hide={() => {
                    void hideProxyWindow().catch((error) => {
                      setLocalMessage(
                        error instanceof Error ? error.message : String(error),
                      );
                    });
                  }}
                  textareaRef={proxyTextareaRef}
                />
              ) : null}

              {activePanel === "devices" ? (
                <DevicesPanel
                  devices={state.devices}
                  selectedDevice={selectedDevice}
                  selectedDeviceId={selectedDeviceId}
                  setSelectedDeviceId={setSelectedDeviceId}
                  updatePermission={updatePermission}
                  registration={state.registration}
                  network={state.network}
                  registrationDeviceName={registrationDeviceName}
                  setRegistrationDeviceName={setRegistrationDeviceName}
                  createRegistration={createRegistration}
                />
              ) : null}

              {activePanel === "settings" ? (
                <AppSettingsPanel
                  backend={state.backend}
                  history={state.history}
                  network={state.network}
                  updateHistory={updateHistory}
                  lockApp={() => send({ type: "lockApp" })}
                />
              ) : null}
            </>
          )}
        </section>
      </div>

      {localMessage ? (
        <div className="fixed bottom-4 right-4 max-w-md rounded-xl border border-border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-md">
          {localMessage}
        </div>
      ) : null}
    </main>
  );
}

async function showProxyWindow() {
  if (isTauri()) {
    await invoke("show_proxy_window");
    return;
  }

  window.focus();
}

async function hideProxyWindow() {
  if (isTauri()) {
    await invoke("hide_proxy_window");
    return;
  }

  throw new Error("Hide is available only in the Tauri desktop shell.");
}

function backendModeTone(mode: BackendStatus["mode"] | undefined) {
  if (mode === "real") {
    return "good";
  }
  if (mode === "unsupported") {
    return "danger";
  }
  return "warn";
}

function NavButton({
  active,
  icon,
  children,
  onClick,
}: {
  active: boolean;
  icon: React.ReactElement<{ className?: string }>;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      className={[
        "flex min-h-9 items-center gap-2 rounded-lg px-2.5 text-left text-sm transition-colors",
        active
          ? "bg-muted text-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      ].join(" ")}
      type="button"
      onClick={onClick}
    >
      {React.cloneElement(icon, { className: "h-4 w-4" })}
      {children}
    </button>
  );
}

function UnlockPanel({
  connected,
  password,
  setPassword,
  unlock,
}: {
  connected: boolean;
  password: string;
  setPassword: (password: string) => void;
  unlock: (event: React.FormEvent) => void;
}) {
  return (
    <Panel className="max-w-xl rounded-xl shadow-none">
      <PanelHeader>
        <div>
          <PanelTitle>Unlock relay</PanelTitle>
          <PanelDescription>
            First unlock creates an encrypted local database with this password
            and stores it in the OS keychain when available.
          </PanelDescription>
        </div>
        <Lock className="h-5 w-5 text-muted-foreground" />
      </PanelHeader>
      <form className="grid gap-3" onSubmit={unlock}>
        <Input
          placeholder="App password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.currentTarget.value)}
        />
        <Button
          className="rounded-lg"
          disabled={!connected || !password}
          type="submit"
        >
          <ShieldCheck className="h-4 w-4" />
          Unlock
        </Button>
      </form>
    </Panel>
  );
}

function ProxyPanel({
  draft,
  revision,
  updateText,
  clear,
  copy,
  hide,
  textareaRef,
}: {
  draft: string;
  revision: number;
  updateText: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
  clear: () => void;
  copy: () => void;
  hide: () => void;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
}) {
  return (
    <Panel className="rounded-xl shadow-none">
      <PanelHeader>
        <div>
          <PanelTitle>Proxy buffer</PanelTitle>
          <PanelDescription>Shared buffer</PanelDescription>
        </div>
        <Badge>rev {revision}</Badge>
      </PanelHeader>
      <Textarea
        aria-label="Desktop proxy buffer"
        className="min-h-[52vh] rounded-xl border border-border bg-input/40"
        placeholder="The phone and this proxy window share this buffer."
        ref={textareaRef}
        value={draft}
        onChange={updateText}
      />
      <div className="mt-3 flex flex-wrap gap-2">
        <Button className="rounded-lg" onClick={copy}>
          <Clipboard className="h-4 w-4" />
          Copy
        </Button>
        <Button className="rounded-lg" onClick={clear}>
          <Trash2 className="h-4 w-4" />
          Clear
        </Button>
        <Button className="rounded-lg" onClick={hide}>
          <X className="h-4 w-4" />
          Hide
        </Button>
      </div>
    </Panel>
  );
}

function DevicesPanel({
  devices,
  selectedDevice,
  selectedDeviceId,
  setSelectedDeviceId,
  updatePermission,
  registration,
  network,
  registrationDeviceName,
  setRegistrationDeviceName,
  createRegistration,
}: {
  devices: Device[];
  selectedDevice: Device | null;
  selectedDeviceId: string;
  setSelectedDeviceId: (deviceId: string) => void;
  updatePermission: (key: keyof DevicePermissions, value: boolean) => void;
  registration: { code: string; expiresAtMs: number } | null;
  network: NetworkStatus;
  registrationDeviceName: string;
  setRegistrationDeviceName: (name: string) => void;
  createRegistration: () => void;
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(360px,480px)_1fr]">
      <RegisterPanel
        registration={registration}
        network={network}
        deviceName={registrationDeviceName}
        setDeviceName={setRegistrationDeviceName}
        createRegistration={createRegistration}
      />
      <PermissionsPanel
        devices={devices}
        selectedDevice={selectedDevice}
        selectedDeviceId={selectedDeviceId}
        setSelectedDeviceId={setSelectedDeviceId}
        updatePermission={updatePermission}
      />
    </div>
  );
}

function RegisterPanel({
  registration,
  network,
  deviceName,
  setDeviceName,
  createRegistration,
}: {
  registration: { code: string; expiresAtMs: number } | null;
  network: NetworkStatus;
  deviceName: string;
  setDeviceName: (name: string) => void;
  createRegistration: () => void;
}) {
  const phoneDevUrl = getPhoneDevUrl(network.phoneUrl, registration?.code);
  const expiresAt = registration
    ? new Date(registration.expiresAtMs).toLocaleTimeString()
    : null;

  return (
    <Panel className="rounded-xl shadow-none">
      <PanelHeader>
        <div>
          <PanelTitle>Register device</PanelTitle>
          <PanelDescription>
            Start registration on the PC, then open the generated phone URL.
          </PanelDescription>
        </div>
        <KeyRound className="h-5 w-5 text-muted-foreground" />
      </PanelHeader>
      <div className="grid gap-4 md:grid-cols-[180px_1fr]">
        <div className="flex aspect-square items-center justify-center rounded-xl border border-border bg-muted/30 p-3 text-center text-xs leading-5 text-muted-foreground">
          {registration ? (
            <div className="rounded-md bg-white p-2">
              <QRCodeSVG
                bgColor="#ffffff"
                fgColor="#111111"
                level="M"
                marginSize={3}
                size={136}
                title="Input Relay phone registration"
                value={phoneDevUrl}
              />
            </div>
          ) : (
            <span>Registration code appears here</span>
          )}
        </div>
        <div>
          <label
            className="text-sm text-muted-foreground"
            htmlFor="device-name"
          >
            Device name
          </label>
          <Input
            className="mt-2"
            id="device-name"
            value={deviceName}
            onChange={(event) => setDeviceName(event.currentTarget.value)}
          />
          <Button className="mt-3 rounded-lg" onClick={createRegistration}>
            <KeyRound className="h-4 w-4" />
            Open registration
          </Button>
          {!network.reachableFromPhone ? (
            <p className="mt-3 text-sm leading-6 text-destructive">
              Relay is localhost-only. Restart with INPUT_RELAY_HOST=0.0.0.0 for
              direct phone testing.
            </p>
          ) : null}
          <p className="mt-4 text-sm text-muted-foreground">Phone dev URL</p>
          <code className="mt-2 block break-all rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm text-foreground">
            {phoneDevUrl}
          </code>
          {expiresAt ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Code expires at {expiresAt}.
            </p>
          ) : null}
          <p className="mt-4 text-sm text-muted-foreground">Relay API</p>
          <code className="mt-2 block break-all rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm text-foreground">
            {getRelayHttpUrl()}
          </code>
        </div>
      </div>
    </Panel>
  );
}

function getPhoneDevUrl(base: string, code?: string) {
  if (!code) {
    return base;
  }
  return `${base}/?registrationCode=${encodeURIComponent(code)}`;
}

function PermissionsPanel({
  devices,
  selectedDevice,
  selectedDeviceId,
  setSelectedDeviceId,
  updatePermission,
}: {
  devices: Device[];
  selectedDevice: Device | null;
  selectedDeviceId: string;
  setSelectedDeviceId: (deviceId: string) => void;
  updatePermission: (key: keyof DevicePermissions, value: boolean) => void;
}) {
  const rows: Array<[keyof DevicePermissions, string]> = [
    ["editBuffer", "Edit proxy buffer"],
    ["acceptInsertText", "Accept insert text"],
    ["clearBuffer", "Clear buffer"],
    ["showProxy", "Show proxy"],
    ["lockPc", "Lock PC"],
  ];

  return (
    <Panel className="rounded-xl shadow-none">
      <PanelHeader>
        <div>
          <PanelTitle>Phone permissions</PanelTitle>
          <PanelDescription>
            Registered phones can edit by default. Other permissions are chosen
            from the PC.
          </PanelDescription>
        </div>
        <CheckCircle2 className="h-5 w-5 text-success" />
      </PanelHeader>
      {devices.length > 0 ? (
        <div className="mb-3 flex flex-wrap gap-2">
          {devices.map((device) => (
            <Button
              className="rounded-lg"
              key={device.id}
              size="sm"
              variant={device.id === selectedDeviceId ? "default" : "secondary"}
              onClick={() => setSelectedDeviceId(device.id)}
            >
              {device.name}
            </Button>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          No phone is registered yet.
        </p>
      )}
      <div className="grid gap-1">
        {rows.map(([key, label]) => (
          <div
            className="flex min-h-11 items-center justify-between border-t border-border first:border-t-0"
            key={key}
          >
            <span className="text-sm text-foreground">{label}</span>
            <Switch
              checked={Boolean(selectedDevice?.permissions[key])}
              disabled={!selectedDevice}
              onCheckedChange={(checked) => updatePermission(key, checked)}
            />
          </div>
        ))}
      </div>
    </Panel>
  );
}

function AppSettingsPanel({
  backend,
  network,
  history,
  updateHistory,
  lockApp,
}: {
  backend: BackendStatus;
  network: NetworkStatus;
  history: HistoryState;
  updateHistory: (mode: HistoryMode, limit?: number) => void;
  lockApp: () => void;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
      <div className="grid content-start gap-4">
        <StatusPanel backend={backend} network={network} />
        <AppLockPanel lockApp={lockApp} />
      </div>
      <HistoryPanel history={history} updateHistory={updateHistory} />
    </div>
  );
}

function StatusPanel({
  backend,
  network,
}: {
  backend: BackendStatus;
  network: NetworkStatus;
}) {
  return (
    <Panel className="rounded-xl shadow-none">
      <PanelHeader>
        <div>
          <PanelTitle>Service status</PanelTitle>
          <PanelDescription>
            Current backend and phone reachability.
          </PanelDescription>
        </div>
        <MonitorUp className="h-5 w-5 text-muted-foreground" />
      </PanelHeader>

      <div className="grid gap-4">
        <section>
          <p className="text-sm font-medium">Backend</p>
          <p className="mt-1 text-sm text-muted-foreground">{backend.label}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge tone={backendModeTone(backend.mode)}>{backend.mode}</Badge>
            <Badge
              tone={backend.capabilities.canInsertText ? "good" : "danger"}
            >
              Insert action
            </Badge>
            <Badge tone={backend.capabilities.canShowProxy ? "good" : "danger"}>
              Proxy window
            </Badge>
          </div>
        </section>

        <section className="border-t border-border pt-4">
          <p className="text-sm font-medium">Network</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge tone={network.tailscale.running ? "good" : "warn"}>
              Tailscale {network.tailscale.running ? "running" : "off"}
            </Badge>
            <Badge tone={network.reachableFromPhone ? "good" : "danger"}>
              {network.reachableFromPhone
                ? "phone reachable"
                : "localhost only"}
            </Badge>
          </div>
          <p className="mt-3 break-all text-xs leading-5 text-muted-foreground">
            {network.relayUrl}
          </p>
        </section>
      </div>
    </Panel>
  );
}

function AppLockPanel({ lockApp }: { lockApp: () => void }) {
  return (
    <Panel className="rounded-xl shadow-none">
      <PanelHeader>
        <div>
          <PanelTitle>App lock</PanelTitle>
          <PanelDescription>
            Lock hides the buffer and blocks phone actions until the relay is
            unlocked on the PC.
          </PanelDescription>
        </div>
        <Lock className="h-5 w-5 text-muted-foreground" />
      </PanelHeader>
      <Button className="rounded-lg" variant="destructive" onClick={lockApp}>
        <Lock className="h-4 w-4" />
        Lock app
      </Button>
    </Panel>
  );
}

function HistoryPanel({
  history,
  updateHistory,
}: {
  history: HistoryState;
  updateHistory: (mode: HistoryMode, limit?: number) => void;
}) {
  return (
    <Panel className="rounded-xl shadow-none">
      <PanelHeader>
        <div>
          <PanelTitle>History</PanelTitle>
          <PanelDescription>
            Default mode is none. Stored entries use the encrypted relay
            database.
          </PanelDescription>
        </div>
        <Database className="h-5 w-5 text-muted-foreground" />
      </PanelHeader>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {(["none", "last", "all"] as HistoryMode[]).map((mode) => (
          <Button
            className="rounded-lg"
            key={mode}
            variant={history.mode === mode ? "default" : "secondary"}
            onClick={() => updateHistory(mode)}
          >
            {mode}
          </Button>
        ))}
        <Input
          className="w-24"
          min={1}
          type="number"
          value={history.limit}
          onChange={(event) =>
            updateHistory(history.mode, Number(event.currentTarget.value))
          }
        />
      </div>
      <div className="grid gap-2">
        {history.entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No history entries stored.
          </p>
        ) : (
          history.entries.map((entry) => (
            <div
              className="rounded-lg bg-muted/40 p-3 ring-1 ring-border/70"
              key={entry.id}
            >
              <p className="whitespace-pre-wrap text-sm text-foreground">
                {entry.text}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                {new Date(entry.createdAtMs).toLocaleString()}
              </p>
            </div>
          ))
        )}
      </div>
    </Panel>
  );
}
