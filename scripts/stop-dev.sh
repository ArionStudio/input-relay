#!/usr/bin/env bash
set -euo pipefail

pkill -f 'target/debug/input-relay-service' >/dev/null 2>&1 || true
pkill -f 'vite --host 127.0.0.1 --port 5173' >/dev/null 2>&1 || true
pkill -f 'vite --host 0.0.0.0 --port 5174' >/dev/null 2>&1 || true
pkill -f 'pnpm dev:service' >/dev/null 2>&1 || true
pkill -f 'pnpm dev:desktop' >/dev/null 2>&1 || true
pkill -f 'pnpm dev:phone' >/dev/null 2>&1 || true
pkill -f 'pnpm --filter @input-relay/desktop dev' >/dev/null 2>&1 || true
pkill -f 'pnpm --filter @input-relay/phone-web dev' >/dev/null 2>&1 || true
pkill -f 'concurrently -k -n service,desktop,phone' >/dev/null 2>&1 || true

echo "Input Relay dev processes stopped."
