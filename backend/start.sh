#!/usr/bin/env bash
set -e

export WA_BRIDGE_URL="${WA_BRIDGE_URL:-http://127.0.0.1:3001}"

if [ ! -d "../wa-bridge/node_modules" ]; then
  npm ci --omit=dev --prefix ../wa-bridge
fi

node ../wa-bridge/index.js &
BRIDGE_PID=$!

cleanup() {
  kill "$BRIDGE_PID" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

uvicorn main:app --host 0.0.0.0 --port "$PORT"