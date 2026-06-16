#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ -z "${ATLAS_ECOSYSTEM_CONFIG:-}" && -f "$ROOT_DIR/.env" ]]; then
  ATLAS_ECOSYSTEM_CONFIG="$(grep -E '^ATLAS_ECOSYSTEM_CONFIG=' "$ROOT_DIR/.env" | cut -d= -f2- || true)"
fi

CONFIG_PATH="${ATLAS_ECOSYSTEM_CONFIG:-ecosystem/atlas.yaml}"
if [[ "$CONFIG_PATH" = /* ]]; then
  CONFIG_ABS="$CONFIG_PATH"
else
  CONFIG_ABS="$ROOT_DIR/$CONFIG_PATH"
fi

cd "$ROOT_DIR"

if [[ -f "$CONFIG_ABS" ]]; then
  echo "$CONFIG_PATH already exists."
  exit 0
fi

if [[ ! -t 0 ]]; then
  cp "$ROOT_DIR/ecosystem/atlas.yaml.example" "$CONFIG_ABS"
  echo "Created $CONFIG_PATH from ecosystem/atlas.yaml.example. Edit it before running seed in production."
  exit 0
fi

read -r -p "Project id [household]: " project_id
project_id="${project_id:-household}"

read -r -p "Project display name [Household Atlas]: " project_name
project_name="${project_name:-Household Atlas}"

read -r -p "Shared agent id [household]: " agent_id
agent_id="${agent_id:-household}"

read -r -p "Shared agent display name [$project_name]: " agent_name
agent_name="${agent_name:-$project_name}"

read -r -p "How many users should be allowed? " user_count
if ! [[ "$user_count" =~ ^[0-9]+$ ]] || [[ "$user_count" -lt 1 ]]; then
  echo "User count must be a positive integer."
  exit 1
fi

mkdir -p "$(dirname "$CONFIG_ABS")"

{
  cat <<YAML
version: 1

project:
  id: $project_id
  name: $project_name

users:
YAML

  user_ids=()
  for index in $(seq 1 "$user_count"); do
    read -r -p "User $index id [user-$index]: " user_id
    user_id="${user_id:-user-$index}"
    read -r -p "User $index display name: " display_name
    display_name="${display_name:-User $index}"
    read -r -p "User $index WhatsApp number in E.164 format: " whatsapp_number

    user_ids+=("$user_id")

    cat <<YAML
  - id: $user_id
    displayName: $display_name
    identities:
      - channel: whatsapp
        externalId: "$whatsapp_number"
        defaultAgent: $agent_id

YAML
  done

  cat <<YAML
agents:
  - id: $agent_id
    displayName: $agent_name
    type: shared
    hermesProfile: $agent_id
    honchoWorkspace: $agent_id
    owners:
YAML

  printf '      - %s\n' "${user_ids[0]}"

  cat <<'YAML'
    members:
YAML
  printf '      - %s\n' "${user_ids[@]}"

  cat <<'YAML'
    routing:
      defaultFor:
YAML
  printf '        - %s\n' "${user_ids[@]}"

  cat <<YAML
      aliases:
        - "family:"
        - "/family"
        - "$agent_id:"
        - "/$agent_id"
    skills:
      - household
      - calendar
      - reminders
      - planning
      - health
    prompt: |
      # $agent_name

      You are the shared agent for this Project Atlas installation.

      Coordinate only information intentionally shared with this workspace.
      Ask for approval before creating reminders, changing calendars, changing goals, or making commitments.
YAML
} > "$CONFIG_ABS"

chmod 600 "$CONFIG_ABS"
echo "Created $CONFIG_PATH."
