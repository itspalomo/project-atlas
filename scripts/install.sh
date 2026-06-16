#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ ! -f .env ]]; then
  cp .env.example .env
  chmod 600 .env
fi

scripts/init-ecosystem.sh

if [[ "$(uname -s)" == "Linux" ]]; then
  scripts/install-system-deps.sh
  scripts/install-tailscale.sh
fi

if grep -Eq 'change-me-generate-with-openssl|POSTGRES_PASSWORD=$|ATLAS_BRIDGE_API_KEY=$|WHATSAPP_VERIFY_TOKEN=$' .env; then
  scripts/rotate-local-secrets.sh
fi

scripts/install-honcho.sh --prepare

if ! scripts/install-honcho.sh --check-env; then
  echo "Honcho needs an LLM provider before the one-command install can complete."
  echo "Set LLM_OPENAI_API_KEY, LLM_ANTHROPIC_API_KEY, or LLM_GEMINI_API_KEY in .env and rerun scripts/install.sh."
  exit 1
fi

docker compose up -d --build postgres honcho-api honcho-deriver
docker compose build atlas-api
docker compose run --rm atlas-api node dist/db/migrate.js
docker compose run --rm atlas-api node dist/db/seed.js
scripts/init-hermes-profiles.sh
docker compose up -d --build atlas-api

cat <<'MSG'
Project Atlas base services are running.

Next steps:
1. Fill WhatsApp Cloud API values in .env.
2. Configure the Meta webhook URL to https://<your-domain>/webhooks/whatsapp.
3. Start a public webhook tunnel or reverse proxy for only /webhooks/whatsapp.
4. Start Hermes with: docker compose --profile runtime up -d --build hermes
MSG
