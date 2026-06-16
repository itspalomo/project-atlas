#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HONCHO_DIR="${HONCHO_DIR:-$ROOT_DIR/vendor/honcho}"
HONCHO_REPO="${HONCHO_REPO:-https://github.com/plastic-labs/honcho.git}"

if [[ ! -d "$HONCHO_DIR/.git" ]]; then
  mkdir -p "$(dirname "$HONCHO_DIR")"
  git clone "$HONCHO_REPO" "$HONCHO_DIR"
else
  git -C "$HONCHO_DIR" pull --ff-only
fi

if [[ -f "$HONCHO_DIR/docker-compose.yml" || -f "$HONCHO_DIR/compose.yaml" ]]; then
  docker compose -f "$HONCHO_DIR/docker-compose.yml" up -d --build 2>/dev/null \
    || docker compose -f "$HONCHO_DIR/compose.yaml" up -d --build
else
  echo "Honcho repository cloned, but no docker-compose.yml or compose.yaml was found."
  echo "Read $HONCHO_DIR for current self-hosting instructions, then set HONCHO_BASE_URL in .env."
fi

echo "Honcho bootstrap complete. Configure HONCHO_BASE_URL and HONCHO_API_KEY in .env."
