#!/usr/bin/env bash
set -euo pipefail

missing=0

check_command() {
  local command_name="$1"
  local package_hint="$2"
  if command -v "$command_name" >/dev/null 2>&1; then
    printf 'ok   %s\n' "$command_name"
  else
    printf 'miss %s  install: %s\n' "$command_name" "$package_hint"
    missing=1
  fi
}

printf 'Input Relay Linux KDE Wayland check\n\n'

session_type="${XDG_SESSION_TYPE:-unknown}"
desktop="${XDG_CURRENT_DESKTOP:-unknown}"
desktop_session="${DESKTOP_SESSION:-unknown}"
printf 'session: %s\n' "$session_type"
printf 'desktop: %s\n' "$desktop"
printf 'desktop session: %s\n\n' "$desktop_session"

if [[ "$session_type" == "wayland" ]]; then
  printf 'ok   wayland session\n'
else
  printf 'miss wayland session  current session is not Wayland\n'
  missing=1
fi

check_command wl-copy wl-clipboard
check_command wl-paste wl-clipboard
check_command qdbus6 qt6-tools
check_command tailscale tailscale
check_command secret-tool libsecret
check_command pnpm pnpm
check_command cargo rustup

if [[ -e /dev/uinput ]]; then
  if [[ -w /dev/uinput ]]; then
    printf 'ok   /dev/uinput writable\n'
  else
    printf 'miss /dev/uinput writable  add user ACL/group access and reload udev\n'
    missing=1
  fi
else
  printf 'miss /dev/uinput  load the uinput kernel module\n'
  missing=1
fi

if tailscale status >/dev/null 2>&1; then
  printf 'ok   tailscale daemon reachable\n'
else
  printf 'miss tailscale daemon reachable  run: sudo systemctl enable --now tailscaled\n'
  missing=1
fi

printf '\n'
if [[ "$missing" -eq 0 ]]; then
  printf 'All required checks passed for this first target.\n'
else
  printf 'One or more checks failed.\n'
fi

exit "$missing"
