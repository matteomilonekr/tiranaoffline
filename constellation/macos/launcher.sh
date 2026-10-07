#!/bin/bash
# Fallback app launcher, used when the Swift window could not be compiled: starts the
# local server if needed, then opens the app in a chromeless browser window.

HOME_DIR="${CONSTELLATION_HOME:-$HOME/.constellation}"
PORT="${CONSTELLATION_PORT:-4747}"
URL="http://127.0.0.1:$PORT"

NODE="$(cat "$HOME_DIR/node-path" 2>/dev/null)"
if [ ! -x "$NODE" ]; then
  for candidate in /opt/homebrew/bin/node /usr/local/bin/node "$HOME_DIR/runtime/bin/node"; do
    if [ -x "$candidate" ]; then NODE="$candidate"; break; fi
  done
fi

if ! curl -fsS --max-time 1 "$URL/api/ping" >/dev/null 2>&1; then
  nohup "$NODE" "$HOME_DIR/app/server.mjs" --port "$PORT" >>"$HOME_DIR/server.log" 2>&1 &
  for _ in $(seq 1 60); do
    curl -fsS --max-time 1 "$URL/api/ping" >/dev/null 2>&1 && break
    sleep 0.25
  done
fi

for browser in "Google Chrome" "Brave Browser" "Microsoft Edge" "Chromium"; do
  if open -Ra "$browser" >/dev/null 2>&1; then
    open -na "$browser" --args --app="$URL" --user-data-dir="$HOME_DIR/window" --no-first-run --window-size=1440,900
    exit 0
  fi
done
open "$URL"
