import * as React from "react";
import type {
  ClientAction,
  ClientEnvelope,
  DesktopCommand,
  Notice,
  RelayState,
  ServerEvent
} from "@input-relay/protocol";

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

        const parsed = JSON.parse(event.data) as ServerEvent;
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
        action
      };

      const response = await fetch(getRelayHttpUrl() + "/api/actions", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify(envelope)
      });

      if (!response.ok) {
        throw new Error(`Relay action failed with ${response.status}`);
      }
      const nextState = (await response.json()) as RelayState;
      setState(nextState);
      if (nextState.lastNotice) {
        setNotice(nextState.lastNotice);
      }
      return nextState;
    },
    [deviceId]
  );

  return { state, notice, desktopCommand, connected, sendAction };
}
