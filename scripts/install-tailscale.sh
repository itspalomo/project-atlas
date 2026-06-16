#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

SUDO=""
if [[ "$(id -u)" -ne 0 ]]; then
  SUDO="sudo"
fi

is_tailscale_up() {
  command -v tailscale >/dev/null 2>&1 \
    && tailscale status --json 2>/dev/null \
      | grep -q '"BackendState"[[:space:]]*:[[:space:]]*"Running"'
}

start_tailscaled() {
  if [[ "$(uname -s)" != "Linux" ]]; then
    return 0
  fi

  if command -v systemctl >/dev/null 2>&1; then
    $SUDO systemctl enable --now tailscaled >/dev/null 2>&1 || true
  elif command -v service >/dev/null 2>&1; then
    $SUDO service tailscaled start >/dev/null 2>&1 || true
  fi
}

if command -v tailscale >/dev/null 2>&1; then
  echo "Tailscale is already installed."
else
  curl -fsSL https://tailscale.com/install.sh | $SUDO sh
fi

start_tailscaled

if is_tailscale_up; then
  echo "Tailscale is already connected; skipping setup."
  exit 0
fi

if [[ -f "$ROOT_DIR/.env" ]]; then
  TAILSCALE_AUTH_KEY="$(grep -E '^TAILSCALE_AUTH_KEY=' "$ROOT_DIR/.env" | cut -d= -f2- || true)"
  TAILSCALE_HOSTNAME="$(grep -E '^TAILSCALE_HOSTNAME=' "$ROOT_DIR/.env" | cut -d= -f2- || true)"
fi

if [[ -n "${TAILSCALE_AUTH_KEY:-}" ]]; then
  $SUDO tailscale up \
    --auth-key "$TAILSCALE_AUTH_KEY" \
    --hostname "${TAILSCALE_HOSTNAME:-project-atlas}" \
    --ssh

  if is_tailscale_up; then
    echo "Tailscale is connected."
  else
    echo "Tailscale setup command completed, but the node does not appear connected yet."
    exit 1
  fi
else
  echo "TAILSCALE_AUTH_KEY is not set. Run 'sudo tailscale up --ssh --hostname project-atlas' to authenticate interactively."
fi
