#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HONCHO_DIR="${HONCHO_DIR:-$ROOT_DIR/vendor/honcho}"
HONCHO_REPO="${HONCHO_REPO:-https://github.com/plastic-labs/honcho.git}"

cd "$ROOT_DIR"

check_env() {
  if [[ ! -f "$ROOT_DIR/.env" ]]; then
    return 1
  fi

  grep -Eq '^(LLM_OPENAI_API_KEY|LLM_ANTHROPIC_API_KEY|LLM_GEMINI_API_KEY)=[^[:space:]]+' "$ROOT_DIR/.env"
}

if [[ "${1:-}" == "--check-env" ]]; then
  check_env
  exit $?
fi

if [[ ! -d "$HONCHO_DIR/.git" ]]; then
  mkdir -p "$(dirname "$HONCHO_DIR")"
  git clone "$HONCHO_REPO" "$HONCHO_DIR"
else
  git -C "$HONCHO_DIR" pull --ff-only
fi

if [[ "${1:-}" == "--prepare" ]]; then
  echo "Honcho source is ready at $HONCHO_DIR."
  exit 0
fi

if ! check_env; then
  echo "Set LLM_OPENAI_API_KEY, LLM_ANTHROPIC_API_KEY, or LLM_GEMINI_API_KEY in .env before starting Honcho."
  exit 1
fi

docker compose up -d --build honcho-api honcho-deriver
echo "Self-hosted Honcho is running at http://127.0.0.1:${HONCHO_HOST_PORT:-8000} and http://honcho-api:8000 inside Compose."
