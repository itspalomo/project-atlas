#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ ! -f .env ]]; then
  cp .env.example .env
  chmod 600 .env
fi

if [[ "$(uname -s)" == "Linux" ]]; then
  scripts/install-system-deps.sh
  scripts/install-tailscale.sh
fi

if grep -Eq 'change-me-generate-with-openssl|POSTGRES_PASSWORD=$|ATLAS_BRIDGE_API_KEY=$|WHATSAPP_VERIFY_TOKEN=$' .env; then
  scripts/rotate-local-secrets.sh
fi

docker compose up -d --build postgres
docker compose build atlas-api
docker compose run --rm atlas-api node dist/db/migrate.js
docker compose run --rm atlas-api node dist/db/seed.js
docker compose up -d --build atlas-api

cat <<'MSG'
Project Atlas base services are running.

Next steps:
1. Fill WhatsApp Cloud API values in .env.
2. Configure the Meta webhook URL to https://<your-domain>/webhooks/whatsapp.
3. Start a public webhook tunnel or reverse proxy for only /webhooks/whatsapp.
4. Start Hermes with: docker compose --profile runtime up -d --build hermes
5. Optionally bootstrap Honcho with: scripts/install-honcho.sh
MSG
