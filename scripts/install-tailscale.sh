#!/usr/bin/env bash
set -euo pipefail

if command -v tailscale >/dev/null 2>&1; then
  echo "Tailscale is already installed."
else
  curl -fsSL https://tailscale.com/install.sh | sh
fi

if [[ -f .env ]]; then
  TAILSCALE_AUTH_KEY="$(grep -E '^TAILSCALE_AUTH_KEY=' .env | cut -d= -f2- || true)"
  TAILSCALE_HOSTNAME="$(grep -E '^TAILSCALE_HOSTNAME=' .env | cut -d= -f2- || true)"
fi

if [[ -n "${TAILSCALE_AUTH_KEY:-}" ]]; then
  sudo tailscale up \
    --auth-key "$TAILSCALE_AUTH_KEY" \
    --hostname "${TAILSCALE_HOSTNAME:-project-atlas}" \
    --ssh
else
  echo "TAILSCALE_AUTH_KEY is not set. Run 'sudo tailscale up --ssh --hostname project-atlas' to authenticate interactively."
fi
