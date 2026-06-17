#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ -f "$ROOT_DIR/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT_DIR/.env"
  set +a
fi

HERMES_HOME_DIR="${HERMES_HOME_DIR:-$ROOT_DIR/data/hermes}"
HERMES_PROFILE_DIR="${HERMES_PROFILE_DIR:-$HERMES_HOME_DIR/profiles}"

cd "$ROOT_DIR"
mkdir -p "$HERMES_HOME_DIR"
mkdir -p "$HERMES_PROFILE_DIR"

CONFIG_PATH="${ATLAS_ECOSYSTEM_CONFIG:-ecosystem/atlas.yaml}"
if [[ ! -f "$ROOT_DIR/$CONFIG_PATH" ]]; then
  "$ROOT_DIR/scripts/init-ecosystem.sh"
fi

if [[ -x "$ROOT_DIR/node_modules/.bin/tsx" ]]; then
  npm run generate:hermes-profiles --workspace @project-atlas/atlas-api -- --home "$HERMES_HOME_DIR" --out "$HERMES_PROFILE_DIR"
else
  docker compose run --rm \
    -v "$HERMES_HOME_DIR:/hermes-data" \
    atlas-api node dist/tools/generateHermesProfiles.js --home /hermes-data --out /hermes-data/profiles
fi
