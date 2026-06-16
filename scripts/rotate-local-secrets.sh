#!/usr/bin/env bash
set -euo pipefail

if [[ ! -f .env ]]; then
  echo ".env does not exist."
  exit 1
fi

replace_if_placeholder() {
  local key="$1"
  local value
  value="$(openssl rand -hex 32 | tr -d '\n')"

  if grep -q "^${key}=change-me-generate-with-openssl" .env || grep -q "^${key}=$" .env; then
    perl -0pi -e "s#^${key}=.*#${key}=${value}#m" .env
  fi
}

replace_if_placeholder "POSTGRES_PASSWORD"
replace_if_placeholder "WHATSAPP_VERIFY_TOKEN"
replace_if_placeholder "ATLAS_BRIDGE_API_KEY"

POSTGRES_PASSWORD_VALUE="$(grep '^POSTGRES_PASSWORD=' .env | cut -d= -f2-)"
if grep -q '^DATABASE_URL=postgres://atlas:change-me-generate-with-openssl@postgres:5432/atlas' .env; then
  perl -0pi -e "s#^DATABASE_URL=.*#DATABASE_URL=postgres://atlas:${POSTGRES_PASSWORD_VALUE}\@postgres:5432/atlas#m" .env
fi

chmod 600 .env
echo "Local secrets rotated in .env."
