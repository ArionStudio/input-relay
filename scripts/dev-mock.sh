#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cat <<'INFO'
Input Relay mock milestone

Run:
  pnpm dev

Then open:
  Desktop UI: http://127.0.0.1:5173
  Phone PWA:  http://127.0.0.1:5174
INFO

cd "$ROOT_DIR"
