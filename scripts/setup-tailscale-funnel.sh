#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ -f "$ROOT_DIR/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT_DIR/.env"
  set +a
fi

FUNNEL_PORT="${TAILSCALE_FUNNEL_PORT:-443}"
FUNNEL_PATH="${TAILSCALE_FUNNEL_PATH:-/webhooks/whatsapp}"
FUNNEL_TARGET="${TAILSCALE_FUNNEL_TARGET:-http://127.0.0.1:${ATLAS_API_PORT:-3000}}"

is_tailscale_up() {
  command -v tailscale >/dev/null 2>&1 \
    && tailscale status --json 2>/dev/null \
      | grep -q '"BackendState"[[:space:]]*:[[:space:]]*"Running"'
}

tailscale_dns_name() {
  if command -v python3 >/dev/null 2>&1; then
    tailscale status --json 2>/dev/null \
      | python3 -c 'import json,sys; print(json.load(sys.stdin).get("Self", {}).get("DNSName", "").rstrip("."))' 2>/dev/null \
      || true
    return 0
  fi

  tailscale status --json 2>/dev/null \
    | tr '\n' ' ' \
    | sed -n 's/.*"Self"[[:space:]]*:[[:space:]]*{[^}]*"DNSName"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' \
    | sed 's/\.$//'
}

if ! command -v tailscale >/dev/null 2>&1; then
  echo "Tailscale is not installed. Run scripts/install-tailscale.sh first."
  exit 1
fi

if ! is_tailscale_up; then
  echo "Tailscale is not connected. Run scripts/install-tailscale.sh or sudo tailscale up --ssh --hostname ${TAILSCALE_HOSTNAME:-project-atlas}."
  exit 1
fi

case "${1:-on}" in
  on)
    sudo tailscale funnel \
      --bg \
      --yes \
      --https="$FUNNEL_PORT" \
      --set-path="$FUNNEL_PATH" \
      "$FUNNEL_TARGET"

    dns_name="$(tailscale_dns_name)"
    if [[ -n "$dns_name" ]]; then
      echo "WhatsApp webhook URL: https://${dns_name}${FUNNEL_PATH}"
    else
      echo "Tailscale Funnel is configured. Run 'tailscale funnel status' to view the public URL."
    fi
    ;;
  off)
    sudo tailscale funnel \
      --https="$FUNNEL_PORT" \
      --set-path="$FUNNEL_PATH" \
      off
    echo "Tailscale Funnel path disabled: $FUNNEL_PATH"
    ;;
  *)
    echo "Usage: scripts/setup-tailscale-funnel.sh [on|off]"
    exit 1
    ;;
esac
