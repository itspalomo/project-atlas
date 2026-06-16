#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HERMES_PROFILE_DIR="${HERMES_PROFILE_DIR:-$ROOT_DIR/data/hermes/profiles}"

mkdir -p "$HERMES_PROFILE_DIR"

for profile in atlas-jose atlas-wife atlas-family; do
  mkdir -p "$HERMES_PROFILE_DIR/$profile"
  cp "$ROOT_DIR/ecosystem/$profile/SOUL.md" "$HERMES_PROFILE_DIR/$profile/SOUL.md"
done

cat > "$HERMES_PROFILE_DIR/atlas-profiles.json" <<'JSON'
{
  "profiles": [
    {
      "id": "atlas-jose",
      "soul": "atlas-jose/SOUL.md",
      "honchoWorkspace": "jose"
    },
    {
      "id": "atlas-wife",
      "soul": "atlas-wife/SOUL.md",
      "honchoWorkspace": "wife"
    },
    {
      "id": "atlas-family",
      "soul": "atlas-family/SOUL.md",
      "honchoWorkspace": "family"
    }
  ]
}
JSON

echo "Hermes profile assets written to $HERMES_PROFILE_DIR."
echo "Use these files when creating Hermes profiles for atlas-jose, atlas-wife, and atlas-family."
