use std::{
    io::Write,
    process::{Command, Stdio},
};

use anyhow::{anyhow, Context, Result};

const SERVICE: &str = "input-relay";
const ACCOUNT: &str = "app-password";

#[derive(Clone)]
pub struct Keychain {
    adapter: KeychainAdapter,
}

#[derive(Clone)]
enum KeychainAdapter {
    LinuxSecretTool { binary: String },
    Unavailable { reason: String },
}

impl Keychain {
    pub fn detect() -> Self {
        if command_exists("secret-tool") {
            return Self {
                adapter: KeychainAdapter::LinuxSecretTool {
                    binary: "secret-tool".into(),
                },
            };
        }

        Self {
            adapter: KeychainAdapter::Unavailable {
                reason: "secret-tool was not found in PATH".into(),
            },
        }
    }

    pub fn label(&self) -> &'static str {
        match self.adapter {
            KeychainAdapter::LinuxSecretTool { .. } => "Linux Secret Service",
            KeychainAdapter::Unavailable { .. } => "Unavailable",
        }
    }

    pub fn available(&self) -> bool {
        matches!(self.adapter, KeychainAdapter::LinuxSecretTool { .. })
    }

    pub fn unavailable_reason(&self) -> Option<&str> {
        match &self.adapter {
            KeychainAdapter::Unavailable { reason } => Some(reason),
            _ => None,
        }
    }

    pub fn load_password(&self) -> Result<Option<String>> {
        match &self.adapter {
            KeychainAdapter::LinuxSecretTool { binary } => {
                let output = Command::new(binary)
                    .args(["lookup", "service", SERVICE, "account", ACCOUNT])
                    .output()
                    .context("failed to run secret-tool lookup")?;

                if output.status.success() {
                    let value = String::from_utf8(output.stdout)
                        .context("secret-tool returned non-UTF8 password")?;
                    let trimmed = value.trim_end_matches(['\r', '\n']).to_string();
                    if trimmed.is_empty() {
                        Ok(None)
                    } else {
                        Ok(Some(trimmed))
                    }
                } else {
                    Ok(None)
                }
            }
            KeychainAdapter::Unavailable { .. } => Ok(None),
        }
    }

    pub fn store_password(&self, password: &str) -> Result<()> {
        match &self.adapter {
            KeychainAdapter::LinuxSecretTool { binary } => {
                let mut child = Command::new(binary)
                    .args([
                        "store",
                        "--label",
                        "Input Relay app unlock",
                        "service",
                        SERVICE,
                        "account",
                        ACCOUNT,
                    ])
                    .stdin(Stdio::piped())
                    .stdout(Stdio::null())
                    .stderr(Stdio::piped())
                    .spawn()
                    .context("failed to run secret-tool store")?;

                let mut stdin = child
                    .stdin
                    .take()
                    .ok_or_else(|| anyhow!("failed to open secret-tool stdin"))?;
                stdin
                    .write_all(password.as_bytes())
                    .context("failed to write password to secret-tool")?;
                drop(stdin);

                let output = child
                    .wait_with_output()
                    .context("failed waiting for secret-tool store")?;

                if output.status.success() {
                    Ok(())
                } else {
                    Err(anyhow!(
                        "secret-tool store failed: {}",
                        String::from_utf8_lossy(&output.stderr).trim()
                    ))
                }
            }
            KeychainAdapter::Unavailable { reason } => Err(anyhow!(reason.clone())),
        }
    }
}

fn command_exists(command: &str) -> bool {
    Command::new("sh")
        .arg("-c")
        .arg(format!("command -v {command} >/dev/null 2>&1"))
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
}
