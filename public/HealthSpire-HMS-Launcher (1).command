#!/bin/bash
# HealthSpire HMS - Desktop App Launcher (macOS) with LAN Discovery
# Server URL: https://sialkotmedical.healthspire.org

CONFIG_DIR="$HOME/.healthspire"
CONFIG_FILE="$CONFIG_DIR/server-url.txt"
LOG_FILE="$CONFIG_DIR/launcher.log"
DEFAULT_URL="https://sialkotmedical.healthspire.org"
PORT=4000

mkdir -p "$CONFIG_DIR"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"
}

log "=== HealthSpire HMS Launcher started ==="

SERVER_URL="$DEFAULT_URL"
if [ -f "$CONFIG_FILE" ]; then
  SAVED=$(cat "$CONFIG_FILE")
  if [ -n "$SAVED" ]; then SERVER_URL="$SAVED"; log "Using saved URL: $SERVER_URL"; fi
fi

check_hims() {
  curl -s --connect-timeout 2 --max-time 3 "$1/api/lan-discovery" 2>/dev/null | grep -q '"service":"hims"'
}

if check_hims "$SERVER_URL"; then
  log "Server found at $SERVER_URL (direct)"
else
  log "Server not found at $SERVER_URL. Searching network..."
  FOUND=""
  for IFACE_IP in $(ifconfig | grep 'inet ' | grep -v '127.0.0.1' | awk '{print $2}' | cut -d/ -f1); do
    BASE=$(echo "$IFACE_IP" | cut -d. -f1-3)
    log "Scanning $BASE.1-254 on port $PORT..."
    for i in $(seq 1 254); do
      CANDIDATE="http://$BASE.$i:$PORT"
      if check_hims "$CANDIDATE"; then
        FOUND="$CANDIDATE"
        log "  Server found at $CANDIDATE!"
        break
      fi
    done
    if [ -n "$FOUND" ]; then break; fi
  done
  if [ -n "$FOUND" ]; then
    SERVER_URL="$FOUND"
    echo "$SERVER_URL" > "$CONFIG_FILE"
    log "Saved new server URL: $SERVER_URL"
  else
    log "Server not found on network. Using default: $SERVER_URL"
  fi
fi

if [ -x "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" ]; then
  open -a "Google Chrome" --app="$SERVER_URL"
  log "Launched Chrome --app=$SERVER_URL"
elif [ -x "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge" ]; then
  open -a "Microsoft Edge" --app="$SERVER_URL"
  log "Launched Edge --app=$SERVER_URL"
else
  open "$SERVER_URL"
  log "Launched default browser: $SERVER_URL"
fi
log "=== Launcher finished ==="
