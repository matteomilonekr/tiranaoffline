#!/usr/bin/env bash
# Scalers Constellation installer.
#
#   curl -fsSL https://raw.githubusercontent.com/matteomilonekr/tiranaoffline/main/constellation/install.sh | bash
#
# Installs into ~/.constellation, adds a "Scalers Constellation" app to ~/Applications on
# macOS and a `constellation` command, then opens the app. No admin rights needed.
# Options (environment): CONSTELLATION_REF=<branch>  CONSTELLATION_NO_LAUNCH=1  CONSTELLATION_PORT=4747

set -euo pipefail

APP_NAME="Scalers Constellation"
REPO="${CONSTELLATION_REPO:-matteomilonekr/tiranaoffline}"
REF="${CONSTELLATION_REF:-main}"
HOME_DIR="${CONSTELLATION_HOME:-$HOME/.constellation}"
APP_DIR="$HOME_DIR/app"
PORT="${CONSTELLATION_PORT:-4747}"
NODE_MIN=18
NODE_PORTABLE="22.12.0"
RAW="https://raw.githubusercontent.com/$REPO/$REF/constellation"

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
note() { printf '  %s\n' "$*"; }
warn() { printf '\033[33m%s\033[0m\n' "$*" >&2; }
die() {
  printf '\033[31m%s\033[0m\n' "$*" >&2
  exit 1
}

bold "Installing $APP_NAME"
mkdir -p "$HOME_DIR"
chmod 700 "$HOME_DIR"

# ---------- Node.js ----------

node_ok() {
  local bin="$1"
  [ -n "$bin" ] && [ -x "$bin" ] || return 1
  local major
  major="$("$bin" -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
  [ "$major" -ge "$NODE_MIN" ] 2>/dev/null
}

find_node() {
  local candidates=("$(command -v node 2>/dev/null || true)" /opt/homebrew/bin/node /usr/local/bin/node "$HOME_DIR/runtime/bin/node")
  local c
  for c in "$HOME"/.nvm/versions/node/*/bin/node "$HOME"/.volta/bin/node "$HOME"/.local/share/fnm/aliases/default/bin/node; do
    candidates+=("$c")
  done
  for c in "${candidates[@]}"; do
    if node_ok "$c"; then
      echo "$c"
      return 0
    fi
  done
  return 1
}

install_node() {
  local os arch plat cpu url
  os="$(uname -s)"
  arch="$(uname -m)"
  case "$os" in
    Darwin) plat=darwin ;;
    Linux) plat=linux ;;
    *) die "This installer supports macOS and Linux. On Windows, install Node.js 18+ and run: node server.mjs --open" ;;
  esac
  case "$arch" in
    arm64 | aarch64) cpu=arm64 ;;
    x86_64 | amd64) cpu=x64 ;;
    *) die "Unsupported processor: $arch" ;;
  esac
  url="https://nodejs.org/dist/v$NODE_PORTABLE/node-v$NODE_PORTABLE-$plat-$cpu.tar.gz"
  note "Node.js $NODE_MIN+ not found: downloading a private copy (only Constellation uses it)…"
  rm -rf "$HOME_DIR/runtime"
  mkdir -p "$HOME_DIR/runtime"
  curl -fsSL "$url" | tar -xz -C "$HOME_DIR/runtime" --strip-components 1 || die "Could not download Node.js from $url"
}

NODE="$(find_node || true)"
if [ -z "$NODE" ]; then
  install_node
  NODE="$HOME_DIR/runtime/bin/node"
  node_ok "$NODE" || die "The downloaded Node.js does not run on this machine."
fi
echo "$NODE" >"$HOME_DIR/node-path"
note "Node.js: $NODE ($("$NODE" -v))"

# ---------- app files ----------

STAGE="$(mktemp -d "${TMPDIR:-/tmp}/constellation.XXXXXX")"
trap 'rm -rf "$STAGE"' EXIT

SOURCE_DIR=""
if [ -n "${BASH_SOURCE[0]:-}" ] && [ -f "${BASH_SOURCE[0]}" ]; then
  candidate="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  [ -f "$candidate/server.mjs" ] && [ -f "$candidate/MANIFEST" ] && SOURCE_DIR="$candidate"
fi

if [ -n "$SOURCE_DIR" ]; then
  note "Copying from $SOURCE_DIR"
  while IFS= read -r file; do
    [ -z "$file" ] && continue
    mkdir -p "$STAGE/$(dirname "$file")"
    cp "$SOURCE_DIR/$file" "$STAGE/$file"
  done <"$SOURCE_DIR/MANIFEST"
  cp "$SOURCE_DIR/MANIFEST" "$STAGE/MANIFEST"
else
  note "Downloading from github.com/$REPO ($REF)"
  curl -fsSL "$RAW/MANIFEST" -o "$STAGE/MANIFEST" || die "Could not reach $RAW. Check your connection and try again."
  while IFS= read -r file; do
    [ -z "$file" ] && continue
    mkdir -p "$STAGE/$(dirname "$file")"
    curl -fsSL "$RAW/$file" -o "$STAGE/$file" || die "Download failed: $file"
  done <"$STAGE/MANIFEST"
fi
[ -f "$STAGE/server.mjs" ] || die "The download looks incomplete."

# Stop a running copy so the new version is what opens.
if [ -f "$HOME_DIR/server.pid" ]; then
  pid="$(cat "$HOME_DIR/server.pid" 2>/dev/null || true)"
  if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
    kill "$pid" 2>/dev/null || true
    sleep 0.5
  fi
fi

rm -rf "$APP_DIR.old"
[ -d "$APP_DIR" ] && mv "$APP_DIR" "$APP_DIR.old"
mkdir -p "$APP_DIR"
cp -R "$STAGE/." "$APP_DIR/"
rm -rf "$APP_DIR.old"
chmod +x "$APP_DIR/server.mjs" "$APP_DIR/macos/launcher.sh" 2>/dev/null || true
VERSION="$("$NODE" -p "require('$APP_DIR/package.json').version" 2>/dev/null || echo 1.0.0)"
note "App files: $APP_DIR (v$VERSION)"

# ---------- command line ----------

BIN_DIR="$HOME/.local/bin"
mkdir -p "$BIN_DIR"
cat >"$BIN_DIR/constellation" <<EOF
#!/bin/sh
exec "$NODE" "$APP_DIR/server.mjs" --port "\${CONSTELLATION_PORT:-$PORT}" --open "\$@"
EOF
chmod +x "$BIN_DIR/constellation"
case ":$PATH:" in
  *":$BIN_DIR:"*) note "Command: constellation" ;;
  *) note "Command: $BIN_DIR/constellation (add $BIN_DIR to your PATH to type just 'constellation')" ;;
esac

# ---------- macOS app ----------

APP_BUNDLE=""
if [ "$(uname -s)" = "Darwin" ]; then
  APP_BUNDLE="$HOME/Applications/$APP_NAME.app"
  rm -rf "$APP_BUNDLE"
  mkdir -p "$APP_BUNDLE/Contents/MacOS" "$APP_BUNDLE/Contents/Resources"
  sed -e "s/__APP_NAME__/$APP_NAME/g" -e "s/__VERSION__/$VERSION/g" "$APP_DIR/macos/Info.plist" >"$APP_BUNDLE/Contents/Info.plist"

  # Icon: build an .icns from the PNG with the tools every Mac has.
  if command -v sips >/dev/null 2>&1 && command -v iconutil >/dev/null 2>&1; then
    ICONSET="$STAGE/AppIcon.iconset"
    mkdir -p "$ICONSET"
    for size in 16 32 128 256 512; do
      sips -z "$size" "$size" "$APP_DIR/macos/icon.png" --out "$ICONSET/icon_${size}x${size}.png" >/dev/null 2>&1 || true
      double=$((size * 2))
      sips -z "$double" "$double" "$APP_DIR/macos/icon.png" --out "$ICONSET/icon_${size}x${size}@2x.png" >/dev/null 2>&1 || true
    done
    iconutil -c icns "$ICONSET" -o "$APP_BUNDLE/Contents/Resources/AppIcon.icns" >/dev/null 2>&1 || warn "Could not build the app icon (the app still works)."
  fi

  # Native window when the Swift compiler is available, browser window otherwise.
  BUILT=0
  if xcrun --find swiftc >/dev/null 2>&1; then
    note "Building the native window (about 20 seconds)…"
    if xcrun swiftc -O "$APP_DIR/macos/ConstellationApp.swift" -o "$APP_BUNDLE/Contents/MacOS/constellation" -framework Cocoa -framework WebKit >"$HOME_DIR/swift-build.log" 2>&1; then
      BUILT=1
    else
      warn "Native build failed, using a browser window instead. Details: $HOME_DIR/swift-build.log"
    fi
  fi
  if [ "$BUILT" != "1" ]; then
    cp "$APP_DIR/macos/launcher.sh" "$APP_BUNDLE/Contents/MacOS/constellation"
    chmod +x "$APP_BUNDLE/Contents/MacOS/constellation"
  fi
  command -v codesign >/dev/null 2>&1 && codesign --force --deep --sign - "$APP_BUNDLE" >/dev/null 2>&1 || true
  touch "$APP_BUNDLE"
  note "App: $APP_BUNDLE"
fi

echo
bold "Done. Constellation runs on this computer and only reads from Meta."
if [ "${CONSTELLATION_NO_LAUNCH:-0}" = "1" ]; then
  exit 0
fi
if [ -n "$APP_BUNDLE" ]; then
  open "$APP_BUNDLE"
else
  note "Starting at http://127.0.0.1:$PORT"
  nohup "$NODE" "$APP_DIR/server.mjs" --port "$PORT" --open >>"$HOME_DIR/server.log" 2>&1 &
fi
