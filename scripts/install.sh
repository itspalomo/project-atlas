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
2. Publish the webhook through Tailscale Funnel with: scripts/atlasctl webhook
3. Use the printed Funnel URL as the Meta webhook callback URL.
4. Start Hermes with: docker compose --profile runtime up -d --build hermes
MSG
