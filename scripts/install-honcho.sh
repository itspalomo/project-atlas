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

HONCHO_DIR="${HONCHO_SOURCE_DIR:-${HONCHO_DIR:-$ROOT_DIR/vendor/honcho}}"
HONCHO_REPO="${HONCHO_REPO:-https://github.com/plastic-labs/honcho.git}"
HONCHO_AUTO_UPDATE="${HONCHO_AUTO_UPDATE:-false}"

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

if [[ ! -d "$HONCHO_DIR" ]]; then
  mkdir -p "$(dirname "$HONCHO_DIR")"
  git clone "$HONCHO_REPO" "$HONCHO_DIR"
elif [[ -d "$HONCHO_DIR/.git" && "$HONCHO_AUTO_UPDATE" == "true" ]]; then
  git -C "$HONCHO_DIR" pull --ff-only
elif [[ -d "$HONCHO_DIR/.git" ]]; then
  echo "Honcho source already exists at $HONCHO_DIR; skipping update."
elif [[ -f "$HONCHO_DIR/Dockerfile" && -f "$HONCHO_DIR/database/init.sql" ]]; then
  echo "Using existing Honcho source directory at $HONCHO_DIR."
else
  echo "$HONCHO_DIR exists but does not look like a Honcho checkout."
  echo "Set HONCHO_SOURCE_DIR to a valid Honcho checkout or remove the directory and rerun."
  exit 1
fi

if [[ "${1:-}" == "--prepare" ]]; then
  echo "Honcho source is ready at $HONCHO_DIR."
  exit 0
fi

if ! check_env; then
  echo "No Honcho LLM provider key is set in .env; continuing because the runtime may provide auth separately."
fi

docker compose up -d --build honcho-api honcho-deriver
echo "Self-hosted Honcho is running at http://127.0.0.1:${HONCHO_HOST_PORT:-8000} and http://honcho-api:8000 inside Compose."
