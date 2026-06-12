import * as React from "react";
import type { Notice, Selection as TextSelection } from "@input-relay/protocol";
import { getRelayHttpUrl, useRelay } from "@input-relay/relay-client";
import { Badge, Button, Input, Textarea } from "@input-relay/ui";
import {
  Check,
  CopyX,
  Eye,
  KeyRound,
  Lock,
  PanelTopOpen,
  Settings,
  Trash2,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";

const DEVICE_ID_STORAGE_KEY = "input-relay.phone.device-id";
const DEVICE_NAME_STORAGE_KEY = "input-relay.phone.device-name";

type PhoneView = "compose" | "settings";

type RegistrationMessage = {
  tone: "error" | "success";
  text: string;
};

type DraftSnapshot = {
  text: string;
  selection: TextSelection;
};

export function App() {
  const { height: viewportHeight, keyboardOpen } = useVisualViewportState();
  const [deviceId, setDeviceId] = React.useState(() =>
    window.localStorage.getItem(DEVICE_ID_STORAGE_KEY),
  );
  const [deviceName, setDeviceName] = React.useState(
    () => window.localStorage.getItem(DEVICE_NAME_STORAGE_KEY) ?? "iPhone",
  );
  const [registrationCode, setRegistrationCode] = React.useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("registrationCode") ?? "";
  });
  const { state, notice, connected, sendAction } = useRelay(
    deviceId ?? undefined,
  );
  const [draft, setDraft] = React.useState("");
  const [toastId, setToastId] = React.useState<string | null>(null);
  const [activeView, setActiveView] = React.useState<PhoneView>("compose");
  const [registrationMessage, setRegistrationMessage] =
    React.useState<RegistrationMessage | null>(null);
  const [registering, setRegistering] = React.useState(false);
  const draftRef = React.useRef<HTMLTextAreaElement | null>(null);
  const draftSelectionRef = React.useRef({ start: 0, end: 0 });

  React.useEffect(() => {
    const meta = import.meta as ImportMeta & { env?: { DEV?: boolean } };
    if (!meta.env?.DEV || !("serviceWorker" in navigator)) {
      return;
    }
    void navigator.serviceWorker
      .getRegistrations()
      .then((registrations) =>
        Promise.all(
          registrations.map((registration) => registration.unregister()),
        ),
      );
  }, []);

  React.useEffect(() => {
    if (state && !state.locked) {
      setDraft(state.buffer.text);
    }
  }, [state?.buffer.revision, state?.locked]);

  React.useEffect(() => {
    if (!notice) {
      return;
    }
    setToastId(notice.id);
    const timeout = window.setTimeout(() => setToastId(null), 2800);
    return () => window.clearTimeout(timeout);
  }, [notice?.id]);

  const currentDevice = deviceId
    ? (state?.devices.find((device) => device.id === deviceId) ?? null)
    : null;
  const permissions = currentDevice?.permissions;
  const locked = state?.locked ?? true;
  const canEdit = !locked && Boolean(permissions?.editBuffer);
  const needsRegistration = !locked && !currentDevice;
  const keyboardComposeMode =
    keyboardOpen && activeView === "compose" && !locked && !needsRegistration;
  const getAcceptDisabledReasonForText = (text: string) =>
    getAcceptDisabledReason({
      connected,
      locked,
      hasPermission: Boolean(permissions?.acceptInsertText),
      hasText: Boolean(text),
    });
  const acceptDisabledReason = getAcceptDisabledReasonForText(draft);
  const toastNotice =
    notice && toastId === notice.id ? formatPhoneNotice(notice) : null;

  const readDraftSelection = React.useCallback(() => {
    const textarea = draftRef.current;
    if (!textarea) {
      return draftSelectionRef.current;
    }

    return {
      start: textarea.selectionStart,
      end: textarea.selectionEnd,
    };
  }, []);

  const updateDraftSelection = React.useCallback(
    (event: React.SyntheticEvent<HTMLTextAreaElement>) => {
      draftSelectionRef.current = {
        start: event.currentTarget.selectionStart,
        end: event.currentTarget.selectionEnd,
      };
    },
    [],
  );

  const updateText = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const next = event.currentTarget.value;
    const selection = {
      start: event.currentTarget.selectionStart,
      end: event.currentTarget.selectionEnd,
    };
    draftSelectionRef.current = selection;
    setDraft(next);
    void sendAction({
      type: "setText",
      text: next,
      selection,
    });
  };

  const send = (action: Parameters<typeof sendAction>[0]) => {
    void sendAction(action);
  };

  const acceptBuffer = (snapshot?: DraftSnapshot) => {
    const text = snapshot?.text ?? draft;
    const selection = snapshot?.selection ?? readDraftSelection();
    if (getAcceptDisabledReasonForText(text)) {
      return;
    }
    draftSelectionRef.current = selection;
    if (text !== draft) {
      setDraft(text);
    }
    send({
      type: "acceptDraftText",
      text,
      selection,
    });
  };

  const registerDevice = async (event: React.FormEvent) => {
    event.preventDefault();
    setRegistrationMessage(null);
    setRegistering(true);

    try {
      const nextDeviceId = makePhoneDeviceId();
      const nextState = await sendAction({
        type: "registerDevice",
        code: registrationCode,
        deviceId: nextDeviceId,
        deviceName,
      });

      if (nextState.devices.some((device) => device.id === nextDeviceId)) {
        window.localStorage.setItem(DEVICE_ID_STORAGE_KEY, nextDeviceId);
        window.localStorage.setItem(DEVICE_NAME_STORAGE_KEY, deviceName);
        setDeviceId(nextDeviceId);
        window.history.replaceState({}, "", window.location.pathname);
        setRegistrationMessage({
          tone: "success",
          text: "Phone registered.",
        });
        return;
      }

      setRegistrationMessage({
        tone: "error",
        text:
          nextState.lastNotice?.message ??
          "Registration did not complete. Open a new registration on the PC and scan again.",
      });
    } catch (error) {
      setRegistrationMessage({
        tone: "error",
        text: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setRegistering(false);
    }
  };

  return (
    <main
      className="mx-auto flex h-[var(--app-viewport-height)] w-full max-w-md flex-col overflow-hidden bg-background text-foreground"
      style={
        {
          "--app-viewport-height": `${viewportHeight}px`,
        } as React.CSSProperties
      }
    >
      {!keyboardComposeMode ? (
        <header className="flex items-center justify-between gap-3 border-b border-border px-4 pb-3 pt-[calc(env(safe-area-inset-top)+0.875rem)]">
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold leading-5">
              Input Relay
            </h1>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {locked
                ? "Locked"
                : (currentDevice?.name ?? "Register this phone")}
            </p>
          </div>
          <Badge tone={connected ? "good" : "danger"}>
            {connected ? (
              <Wifi className="h-3.5 w-3.5" />
            ) : (
              <WifiOff className="h-3.5 w-3.5" />
            )}
            <span className="ml-1.5">{connected ? "Online" : "Offline"}</span>
          </Badge>
        </header>
      ) : null}

      <section
        className={[
          "flex min-h-0 flex-1 flex-col overflow-hidden",
          keyboardComposeMode ? "px-0 py-0" : "px-4 py-3",
        ].join(" ")}
      >
        {locked ? (
          <LockedView />
        ) : needsRegistration ? (
          <RegisterDevicePanel
            connected={connected}
            deviceName={deviceName}
            registrationCode={registrationCode}
            registrationExpiresAt={state?.registration?.expiresAtMs ?? null}
            registrationMessage={registrationMessage}
            registering={registering}
            setDeviceName={setDeviceName}
            setRegistrationCode={setRegistrationCode}
            registerDevice={registerDevice}
          />
        ) : activeView === "compose" ? (
          <ComposeView
            accept={acceptBuffer}
            acceptDisabledReason={acceptDisabledReason}
            canEdit={canEdit}
            clear={() => send({ type: "clearBuffer" })}
            clearDisabled={!permissions?.clearBuffer || !draft}
            draft={draft}
            keyboardOpen={keyboardComposeMode}
            revision={state?.buffer.revision ?? 0}
            textareaRef={draftRef}
            updateSelection={updateDraftSelection}
            updateText={updateText}
          />
        ) : (
          <PhoneSettingsView
            connected={connected}
            currentDevice={currentDevice}
            permissions={permissions}
            showProxy={() => send({ type: "showProxy" })}
            lockPc={() => send({ type: "lockPc" })}
          />
        )}
      </section>

      {!keyboardComposeMode &&
      !locked &&
      !needsRegistration &&
      currentDevice ? (
        <PhoneTabs activeView={activeView} setActiveView={setActiveView} />
      ) : null}

      {!keyboardComposeMode && toastNotice ? (
        <PhoneToast
          icon={
            notice?.level === "error" ? (
              <CopyX className="h-4 w-4 text-destructive" />
            ) : (
              <Eye className="h-4 w-4 text-success" />
            )
          }
          message={toastNotice}
          onDismiss={() => setToastId(null)}
        />
      ) : null}
    </main>
  );
}

function PhoneToast({
  icon,
  message,
  onDismiss,
}: {
  icon: React.ReactNode;
  message: string;
  onDismiss: () => void;
}) {
  const pointerStartRef = React.useRef<{ x: number; y: number } | null>(null);

  const dismissOnSwipe = (event: React.PointerEvent<HTMLDivElement>) => {
    const start = pointerStartRef.current;
    pointerStartRef.current = null;
    if (!start) {
      return;
    }

    const deltaX = Math.abs(event.clientX - start.x);
    const deltaY = Math.abs(event.clientY - start.y);
    if (deltaX > 36 || deltaY > 28) {
      onDismiss();
    }
  };

  return (
    <div
      className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+5rem)] touch-pan-y rounded-xl border border-border bg-popover py-1 pl-3 pr-1 text-sm text-popover-foreground shadow-md"
      role="status"
      onClick={onDismiss}
      onPointerDown={(event) => {
        pointerStartRef.current = { x: event.clientX, y: event.clientY };
      }}
      onPointerUp={dismissOnSwipe}
      onPointerCancel={() => {
        pointerStartRef.current = null;
      }}
    >
      <div className="flex min-h-11 items-center gap-2">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center">
          {icon}
        </div>
        <span className="min-w-0 flex-1 truncate">{message}</span>
        <button
          aria-label="Dismiss"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground"
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onDismiss();
          }}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function formatPhoneNotice(notice: Notice) {
  const message = notice.message.toLowerCase();

  if (message.includes("paste shortcut sent")) {
    return "Paste sent";
  }
  if (message.includes("insert failed")) {
    return "Paste failed";
  }
  if (message.includes("nothing to insert")) {
    return "Nothing to paste";
  }
  if (message.includes("buffer cleared")) {
    return "Cleared";
  }
  if (message.includes("proxy window requested")) {
    return "Proxy opened";
  }
  if (message.includes("relay is locked")) {
    return "PC locked";
  }
  if (message.includes("permission")) {
    return "Not allowed";
  }

  if (notice.message.length <= 44) {
    return notice.message;
  }

  if (notice.level === "error") {
    return "Action failed";
  }
  if (notice.level === "warning") {
    return "Action needs attention";
  }
  return "Done";
}

function useVisualViewportState() {
  const getHeight = () =>
    Math.round(window.visualViewport?.height ?? window.innerHeight);
  const getOrientationKey = () =>
    `${window.screen.orientation?.angle ?? 0}:${window.screen.width}x${window.screen.height}`;
  const maxHeightRef = React.useRef(getHeight());
  const orientationKeyRef = React.useRef(getOrientationKey());
  const [state, setState] = React.useState(() => ({
    height: getHeight(),
    keyboardOpen: false,
  }));

  React.useEffect(() => {
    const updateHeight = () => {
      const height = getHeight();
      const orientationKey = getOrientationKey();

      if (orientationKey !== orientationKeyRef.current) {
        orientationKeyRef.current = orientationKey;
        maxHeightRef.current = height;
      } else if (height > maxHeightRef.current) {
        maxHeightRef.current = height;
      }

      setState({
        height,
        keyboardOpen: height < maxHeightRef.current - 120,
      });
    };
    const viewport = window.visualViewport;

    updateHeight();
    window.addEventListener("resize", updateHeight);
    window.addEventListener("orientationchange", updateHeight);
    viewport?.addEventListener("resize", updateHeight);
    viewport?.addEventListener("scroll", updateHeight);

    return () => {
      window.removeEventListener("resize", updateHeight);
      window.removeEventListener("orientationchange", updateHeight);
      viewport?.removeEventListener("resize", updateHeight);
      viewport?.removeEventListener("scroll", updateHeight);
    };
  }, []);

  return state;
}

function LockedView() {
  return (
    <div className="flex flex-1 flex-col justify-center rounded-xl border border-border bg-card p-5">
      <div className="mx-auto flex max-w-64 flex-col items-center text-center">
        <Lock className="mb-3 h-8 w-8 text-muted-foreground" />
        <h2 className="text-base font-semibold">Relay locked</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Unlock on the PC to use this phone.
        </p>
      </div>
    </div>
  );
}

function ComposeView({
  draft,
  revision,
  canEdit,
  acceptDisabledReason,
  clearDisabled,
  keyboardOpen,
  textareaRef,
  updateSelection,
  updateText,
  accept,
  clear,
}: {
  draft: string;
  revision: number;
  canEdit: boolean;
  acceptDisabledReason: string | null;
  clearDisabled: boolean;
  keyboardOpen: boolean;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  updateSelection: (event: React.SyntheticEvent<HTMLTextAreaElement>) => void;
  updateText: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
  accept: (snapshot?: DraftSnapshot) => void;
  clear: () => void;
}) {
  const pendingSubmitSnapshotRef = React.useRef<DraftSnapshot | null>(null);
  const acceptRef = React.useRef(accept);
  const statusText = !canEdit
    ? "Read only"
    : draft.length > 0
      ? `${draft.length} characters`
      : "Empty";

  React.useEffect(() => {
    acceptRef.current = accept;
  }, [accept]);

  React.useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }

    const readTextareaSnapshot = (): DraftSnapshot => ({
      text: textarea.value,
      selection: {
        start: textarea.selectionStart,
        end: textarea.selectionEnd,
      },
    });

    const acceptTextareaSnapshot = (snapshot: DraftSnapshot) => {
      textarea.value = snapshot.text;
      textarea.selectionStart = snapshot.selection.start;
      textarea.selectionEnd = snapshot.selection.end;
      acceptRef.current(snapshot);
    };

    const readSnapshotBeforeInsertedLineBreak = (): DraftSnapshot => {
      const text = textarea.value;
      const selectionStart = textarea.selectionStart;
      const selectionEnd = textarea.selectionEnd;
      const caret = Math.max(selectionStart, selectionEnd);
      const lineBreakIndex =
        caret > 0 && text[caret - 1] === "\n" ? caret - 1 : -1;

      if (lineBreakIndex === -1) {
        return {
          text,
          selection: {
            start: selectionStart,
            end: selectionEnd,
          },
        };
      }

      return {
        text: text.slice(0, lineBreakIndex) + text.slice(lineBreakIndex + 1),
        selection: {
          start: lineBreakIndex,
          end: lineBreakIndex,
        },
      };
    };

    const isSubmitInput = (event: InputEvent) =>
      !event.isComposing &&
      (event.inputType === "insertLineBreak" ||
        event.inputType === "insertParagraph");

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Enter" || event.shiftKey || event.isComposing) {
        return;
      }
      event.preventDefault();
      pendingSubmitSnapshotRef.current = null;
      acceptTextareaSnapshot(readTextareaSnapshot());
    };

    const handleBeforeInput = (event: InputEvent) => {
      if (!isSubmitInput(event)) {
        return;
      }

      const snapshot = readTextareaSnapshot();
      pendingSubmitSnapshotRef.current = snapshot;

      if (event.cancelable) {
        event.preventDefault();
        pendingSubmitSnapshotRef.current = null;
        acceptTextareaSnapshot(snapshot);
      }
    };

    const handleInput = (event: Event) => {
      const inputEvent = event as InputEvent;
      if (!isSubmitInput(inputEvent)) {
        return;
      }

      const snapshot =
        pendingSubmitSnapshotRef.current ??
        readSnapshotBeforeInsertedLineBreak();
      pendingSubmitSnapshotRef.current = null;
      acceptTextareaSnapshot(snapshot);
    };

    textarea.addEventListener("keydown", handleKeyDown);
    textarea.addEventListener("beforeinput", handleBeforeInput);
    textarea.addEventListener("input", handleInput);

    return () => {
      textarea.removeEventListener("keydown", handleKeyDown);
      textarea.removeEventListener("beforeinput", handleBeforeInput);
      textarea.removeEventListener("input", handleInput);
    };
  }, [textareaRef]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {!keyboardOpen ? (
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="truncate text-sm text-muted-foreground">{statusText}</p>
          <Badge>rev {revision}</Badge>
        </div>
      ) : null}
      <Textarea
        aria-label="Proxy buffer"
        autoFocus
        className={[
          "min-h-0 flex-1 resize-none text-[16px] leading-7 shadow-none",
          keyboardOpen
            ? "rounded-none border-0 bg-background px-4 py-4"
            : "rounded-xl border border-border bg-card px-4 py-4",
        ].join(" ")}
        disabled={!canEdit}
        enterKeyHint="send"
        placeholder="Type here"
        ref={textareaRef}
        value={draft}
        onChange={updateText}
        onKeyUp={updateSelection}
        onMouseUp={updateSelection}
        onSelect={updateSelection}
      />
      {!keyboardOpen ? (
        <div className="mt-3 grid gap-2">
          <Button
            className="h-12 text-base"
            disabled={Boolean(acceptDisabledReason)}
            onClick={accept}
          >
            <Check className="h-4 w-4" />
            Accept
          </Button>
          <Button
            className="h-11"
            disabled={clearDisabled}
            variant="secondary"
            onClick={clear}
          >
            <Trash2 className="h-4 w-4" />
            Clear
          </Button>
          <p className="min-h-5 text-center text-xs text-muted-foreground">
            {acceptDisabledReason ?? "Ready"}
          </p>
        </div>
      ) : null}
    </div>
  );
}

function PhoneSettingsView({
  connected,
  currentDevice,
  permissions,
  showProxy,
  lockPc,
}: {
  connected: boolean;
  currentDevice: {
    id: string;
    name: string;
    verified: boolean;
  } | null;
  permissions:
    | {
        editBuffer: boolean;
        acceptInsertText: boolean;
        clearBuffer: boolean;
        showProxy: boolean;
        lockPc: boolean;
      }
    | undefined;
  showProxy: () => void;
  lockPc: () => void;
}) {
  const rows: Array<[keyof NonNullable<typeof permissions>, string]> = [
    ["editBuffer", "Edit buffer"],
    ["acceptInsertText", "Accept"],
    ["clearBuffer", "Clear"],
    ["showProxy", "Show proxy"],
    ["lockPc", "Lock PC"],
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pb-2">
      <section className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-medium">
              {currentDevice?.name ?? "Phone"}
            </h2>
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {connected ? "Connected" : "Offline"}
            </p>
          </div>
          <Badge tone={currentDevice?.verified ? "good" : "warn"}>
            {currentDevice?.verified ? "Verified" : "Pending"}
          </Badge>
        </div>
        <p className="mt-3 break-all text-xs leading-5 text-muted-foreground">
          {getRelayHttpUrl()}
        </p>
      </section>

      <section className="rounded-xl border border-border bg-card p-4">
        <h2 className="text-sm font-medium">Permissions</h2>
        <div className="mt-3 divide-y divide-border">
          {rows.map(([key, label]) => (
            <div
              className="flex min-h-10 items-center justify-between"
              key={key}
            >
              <span className="text-sm text-foreground">{label}</span>
              <span
                className={
                  permissions?.[key]
                    ? "text-sm text-success"
                    : "text-sm text-muted-foreground"
                }
              >
                {permissions?.[key] ? "On" : "Off"}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-2 rounded-xl border border-border bg-card p-4">
        <Button disabled={!permissions?.showProxy} onClick={showProxy}>
          <PanelTopOpen className="h-4 w-4" />
          Show proxy
        </Button>
        <Button
          disabled={!permissions?.lockPc}
          variant="destructive"
          onClick={lockPc}
        >
          <Lock className="h-4 w-4" />
          Lock PC
        </Button>
      </section>
    </div>
  );
}

function PhoneTabs({
  activeView,
  setActiveView,
}: {
  activeView: PhoneView;
  setActiveView: (view: PhoneView) => void;
}) {
  return (
    <nav className="grid grid-cols-2 gap-2 border-t border-border px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3">
      <PhoneTabButton
        active={activeView === "compose"}
        icon={<Check />}
        onClick={() => setActiveView("compose")}
      >
        Compose
      </PhoneTabButton>
      <PhoneTabButton
        active={activeView === "settings"}
        icon={<Settings />}
        onClick={() => setActiveView("settings")}
      >
        Settings
      </PhoneTabButton>
    </nav>
  );
}

function PhoneTabButton({
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
        "flex h-11 touch-manipulation items-center justify-center gap-2 rounded-xl border text-sm font-medium transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-card text-muted-foreground",
      ].join(" ")}
      type="button"
      onClick={onClick}
    >
      {React.cloneElement(icon, { className: "h-4 w-4" })}
      {children}
    </button>
  );
}

function RegisterDevicePanel({
  connected,
  deviceName,
  registrationCode,
  registrationExpiresAt,
  registrationMessage,
  registering,
  setDeviceName,
  setRegistrationCode,
  registerDevice,
}: {
  connected: boolean;
  deviceName: string;
  registrationCode: string;
  registrationExpiresAt: number | null;
  registrationMessage: RegistrationMessage | null;
  registering: boolean;
  setDeviceName: (name: string) => void;
  setRegistrationCode: (code: string) => void;
  registerDevice: (event: React.FormEvent) => void;
}) {
  const registrationExpired =
    registrationExpiresAt !== null && Date.now() > registrationExpiresAt;
  const disabledReason = getRegistrationDisabledReason({
    connected,
    deviceName,
    registrationCode,
    registrationExpired,
    registrationExpiresAt,
  });

  return (
    <div className="flex flex-1 flex-col justify-center rounded-xl border border-border bg-card p-4">
      <form
        className="mx-auto grid w-full max-w-sm gap-3"
        onSubmit={registerDevice}
      >
        <div className="flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-base font-semibold">Register phone</h2>
        </div>
        <Input
          aria-label="Device name"
          placeholder="Device name"
          value={deviceName}
          onChange={(event) => setDeviceName(event.currentTarget.value)}
        />
        <Input
          aria-label="Registration code"
          className="font-mono"
          placeholder="Registration code"
          value={registrationCode}
          onChange={(event) => setRegistrationCode(event.currentTarget.value)}
        />
        {registrationExpiresAt ? (
          <p className="text-xs text-muted-foreground">
            Expires at {new Date(registrationExpiresAt).toLocaleTimeString()}.
          </p>
        ) : null}
        {disabledReason ? (
          <p className="text-sm leading-6 text-destructive">{disabledReason}</p>
        ) : null}
        {registrationMessage ? (
          <p
            className={[
              "text-sm leading-6",
              registrationMessage.tone === "success"
                ? "text-success"
                : "text-destructive",
            ].join(" ")}
          >
            {registrationMessage.text}
          </p>
        ) : null}
        <Button disabled={Boolean(disabledReason) || registering} type="submit">
          <KeyRound className="h-4 w-4" />
          {registering ? "Registering..." : "Register"}
        </Button>
      </form>
    </div>
  );
}

function getAcceptDisabledReason({
  connected,
  locked,
  hasPermission,
  hasText,
}: {
  connected: boolean;
  locked: boolean;
  hasPermission: boolean;
  hasText: boolean;
}) {
  if (!connected) {
    return "Offline";
  }
  if (locked) {
    return "Locked";
  }
  if (!hasPermission) {
    return "Accept disabled";
  }
  if (!hasText) {
    return "Buffer is empty";
  }
  return null;
}

function getRegistrationDisabledReason({
  connected,
  deviceName,
  registrationCode,
  registrationExpired,
  registrationExpiresAt,
}: {
  connected: boolean;
  deviceName: string;
  registrationCode: string;
  registrationExpired: boolean;
  registrationExpiresAt: number | null;
}) {
  if (!connected) {
    return `Phone cannot reach the relay at ${getRelayHttpUrl()}. Start the PC with pnpm dev:reachable.`;
  }
  if (!registrationCode.trim()) {
    return "Registration code is missing. Scan the QR from the PC registration panel again.";
  }
  if (!deviceName.trim()) {
    return "Device name is required.";
  }
  if (registrationExpiresAt === null) {
    return "No active registration is open on the PC.";
  }
  if (registrationExpired) {
    return "Registration code expired. Open a new registration on the PC.";
  }
  return null;
}

function makePhoneDeviceId() {
  const browserCrypto = globalThis.crypto as
    | (Crypto & { randomUUID?: () => string })
    | undefined;

  if (browserCrypto?.randomUUID) {
    return `phone-${browserCrypto.randomUUID()}`;
  }

  if (browserCrypto?.getRandomValues) {
    const bytes = new Uint8Array(16);
    browserCrypto.getRandomValues(bytes);
    const hex = Array.from(bytes, (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
    return `phone-${hex}`;
  }

  return `phone-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2)}`;
}
