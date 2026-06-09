import * as React from "react";
import type {
  ClientAction,
  ClientEnvelope,
  DesktopCommand,
  Notice,
  RelayState,
  ServerEvent,
} from "@input-relay/protocol";

const ACTION_TIMEOUT_MS = 10_000;

export type RelayConnection = {
  state: RelayState | null;
  notice: Notice | null;
  desktopCommand: DesktopCommand | null;
  connected: boolean;
  sendAction: (action: ClientAction) => Promise<RelayState>;
};

export function getRelayHttpUrl() {
  const meta = import.meta as ImportMeta & {
    env?: { VITE_RELAY_URL?: string };
  };
  const envUrl = meta.env?.VITE_RELAY_URL;
  if (envUrl) {
    return envUrl.replace(/\/$/, "");
  }

  if (
    typeof window !== "undefined" &&
    window.location.hostname &&
    window.location.hostname !== "localhost" &&
    window.location.hostname !== "127.0.0.1"
  ) {
    return `${window.location.protocol}//${window.location.hostname}:4317`;
  }

  return "http://127.0.0.1:4317";
}

export function getRelayWsUrl() {
  return getRelayHttpUrl().replace(/^http/, "ws") + "/ws";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function isRelayState(value: unknown): value is RelayState {
  return (
    isRecord(value) &&
    typeof value.locked === "boolean" &&
    isRecord(value.buffer)
  );
}

function isNotice(value: unknown): value is Notice {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.level === "string" &&
    typeof value.message === "string"
  );
}

function isDesktopCommand(value: unknown): value is DesktopCommand {
  return (
    isRecord(value) &&
    value.type === "showProxy" &&
    typeof value.id === "string"
  );
}

function parseServerEvent(data: string): ServerEvent | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    return null;
  }

  if (!isRecord(parsed) || typeof parsed.type !== "string") {
    return null;
  }

  if (parsed.type === "state" && isRelayState(parsed.state)) {
    return {
      type: "state",
      state: parsed.state,
    };
  }

  if (parsed.type === "notice" && isNotice(parsed.notice)) {
    return {
      type: "notice",
      notice: parsed.notice,
    };
  }

  if (parsed.type === "desktopCommand" && isDesktopCommand(parsed.command)) {
    return {
      type: "desktopCommand",
      command: parsed.command,
    };
  }

  return null;
}

function formatUnknownError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function useRelay(deviceId?: string): RelayConnection {
  const [state, setState] = React.useState<RelayState | null>(null);
  const [notice, setNotice] = React.useState<Notice | null>(null);
  const [desktopCommand, setDesktopCommand] =
    React.useState<DesktopCommand | null>(null);
  const [connected, setConnected] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    let reconnect: number | undefined;
    let socket: WebSocket | undefined;

    const connect = () => {
      socket = new WebSocket(getRelayWsUrl());

      socket.addEventListener("open", () => {
        if (!cancelled) {
          setConnected(true);
        }
      });

      socket.addEventListener("message", (event) => {
        if (cancelled || typeof event.data !== "string") {
          return;
        }

        const parsed = parseServerEvent(event.data);
        if (!parsed) {
          return;
        }

        if (parsed.type === "state") {
          setState(parsed.state);
          if (parsed.state.lastNotice) {
            setNotice(parsed.state.lastNotice);
          }
        }
        if (parsed.type === "notice") {
          setNotice(parsed.notice);
        }
        if (parsed.type === "desktopCommand") {
          setDesktopCommand(parsed.command);
        }
      });

      socket.addEventListener("close", () => {
        if (cancelled) {
          return;
        }
        setConnected(false);
        reconnect = window.setTimeout(connect, 900);
      });

      socket.addEventListener("error", () => {
        socket?.close();
      });
    };

    connect();

    return () => {
      cancelled = true;
      setConnected(false);
      if (reconnect !== undefined) {
        window.clearTimeout(reconnect);
      }
      socket?.close();
    };
  }, []);

  const sendAction = React.useCallback(
    async (action: ClientAction) => {
      const envelope: ClientEnvelope = {
        version: 1,
        ...(deviceId ? { deviceId } : {}),
        action,
      };

      const controller = new AbortController();
      const timeout = window.setTimeout(() => {
        controller.abort();
      }, ACTION_TIMEOUT_MS);

      let response: Response;
      try {
        response = await fetch(getRelayHttpUrl() + "/api/actions", {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify(envelope),
          signal: controller.signal,
        });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          throw new Error("Relay action timed out.");
        }
        throw error;
      } finally {
        window.clearTimeout(timeout);
      }

      if (!response.ok) {
        throw new Error(`Relay action failed with ${response.status}`);
      }

      let payload: unknown;
      try {
        payload = await response.json();
      } catch (error) {
        throw new Error(
          `Relay returned invalid JSON: ${formatUnknownError(error)}`,
        );
      }

      if (!isRelayState(payload)) {
        throw new Error("Relay returned an invalid state payload.");
      }

      const nextState = payload;
      setState(nextState);
      if (nextState.lastNotice) {
        setNotice(nextState.lastNotice);
      }
      return nextState;
    },
    [deviceId],
  );

  return { state, notice, desktopCommand, connected, sendAction };
}
