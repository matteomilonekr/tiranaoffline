#!/bin/sh
# Chrome for motionmaxxing's scripts in a cloud session, where everything runs as root and Chrome refuses to start
# with its sandbox on. Use it with: export CHROME_PATH="$PWD/.claude/chrome-cloud.sh". Not needed on a Mac.
for c in "$CHROME" /opt/pw-browsers/chromium /usr/bin/chromium /usr/bin/chromium-browser /usr/bin/google-chrome; do
  [ -n "$c" ] && [ -x "$c" ] && exec "$c" --no-sandbox "$@"
done
echo "chrome-cloud.sh: no Chrome or Chromium found (set CHROME to its path)" >&2
exit 1
