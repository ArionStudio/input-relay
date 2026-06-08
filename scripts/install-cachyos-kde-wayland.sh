#!/usr/bin/env bash
set -euo pipefail

if ! command -v pacman >/dev/null 2>&1; then
  printf 'This installer targets CachyOS/Arch-like systems with pacman.\n' >&2
  exit 1
fi

packages=(
  base-devel
  gtk3
  libayatana-appindicator
  libsecret
  pnpm
  qt6-tools
  rustup
  tailscale
  webkit2gtk-4.1
  wl-clipboard
)

printf 'Installing Input Relay dependencies for CachyOS/Arch-like KDE Wayland.\n'
sudo pacman -S --needed "${packages[@]}"

if ! rustup default >/dev/null 2>&1; then
  rustup default stable
fi

sudo systemctl enable --now tailscaled

sudo install -Dm644 /dev/stdin /etc/udev/rules.d/70-input-relay-uinput.rules <<'RULE'
KERNEL=="uinput", GROUP="input", MODE="0660", TAG+="uaccess"
RULE
sudo usermod -aG input "$USER"
sudo modprobe uinput || true
sudo udevadm control --reload-rules
sudo udevadm trigger /dev/uinput || true

pnpm install

printf '\nInstall step finished. Log out and back in if /dev/uinput is not writable yet.\n'
printf 'Run scripts/check-linux-kde-wayland.sh to verify the environment.\n'
