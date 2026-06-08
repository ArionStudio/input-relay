use std::{
    net::IpAddr,
    process::{Command, Stdio},
};

use input_relay_protocol::{NetworkStatus, TailscaleStatus};
use serde_json::Value;

pub fn detect(bind_host: IpAddr, relay_port: u16, phone_port: u16) -> NetworkStatus {
    let tailscale = detect_tailscale();
    let reachable_from_phone = !bind_host.is_loopback();
    let url_host = preferred_url_host(bind_host, &tailscale);
    let relay_url = format!("http://{url_host}:{relay_port}");
    let phone_url = format!("http://{url_host}:{phone_port}");

    let mut notes = Vec::new();
    if tailscale.running {
        notes.push(format!(
            "Tailscale running with {}.",
            tailscale
                .ips
                .first()
                .map(String::as_str)
                .unwrap_or("no reported IP")
        ));
    } else if tailscale.available {
        notes.push("Tailscale CLI is installed, but the daemon is not running.".into());
    } else {
        notes.push("Tailscale CLI was not found.".into());
    }

    if reachable_from_phone {
        notes.push(format!("Relay listens on {bind_host}:{relay_port}."));
    } else {
        notes.push(
            "Relay is bound to localhost. Phones cannot reach it directly over Tailscale or LAN."
                .into(),
        );
        notes.push("Start with INPUT_RELAY_HOST=0.0.0.0 for direct phone testing.".into());
    }

    NetworkStatus {
        bind_host: bind_host.to_string(),
        relay_port,
        phone_port,
        relay_url,
        phone_url,
        reachable_from_phone,
        tailscale,
        notes,
    }
}

fn preferred_url_host(bind_host: IpAddr, tailscale: &TailscaleStatus) -> String {
    if bind_host.is_loopback() {
        return "127.0.0.1".into();
    }

    if let Some(ip) = tailscale.ips.iter().find(|ip| ip.contains('.')) {
        return ip.clone();
    }

    bind_host.to_string()
}

fn detect_tailscale() -> TailscaleStatus {
    let output = Command::new("tailscale")
        .args(["status", "--json"])
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .output();

    let Ok(output) = output else {
        return TailscaleStatus {
            available: false,
            running: false,
            hostname: None,
            dns_name: None,
            ips: Vec::new(),
        };
    };

    if !output.status.success() {
        return TailscaleStatus {
            available: true,
            running: false,
            hostname: None,
            dns_name: None,
            ips: Vec::new(),
        };
    }

    let parsed = serde_json::from_slice::<Value>(&output.stdout).unwrap_or(Value::Null);
    let backend_state = parsed
        .get("BackendState")
        .and_then(Value::as_str)
        .unwrap_or("unknown");
    let ips = parsed
        .get("TailscaleIPs")
        .and_then(Value::as_array)
        .map(|values| {
            values
                .iter()
                .filter_map(Value::as_str)
                .map(ToOwned::to_owned)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    let self_node = parsed.get("Self").unwrap_or(&Value::Null);

    TailscaleStatus {
        available: true,
        running: backend_state == "Running" && !ips.is_empty(),
        hostname: self_node
            .get("HostName")
            .and_then(Value::as_str)
            .map(ToOwned::to_owned),
        dns_name: self_node
            .get("DNSName")
            .and_then(Value::as_str)
            .map(ToOwned::to_owned),
        ips,
    }
}
