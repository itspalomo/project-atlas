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

if [[ "${ATLAS_COLOR:-auto}" == "always" ]] || { [[ "${ATLAS_COLOR:-auto}" == "auto" && -t 1 && -z "${NO_COLOR:-}" && "${TERM:-}" != "dumb" ]]; }; then
  BOLD="$(printf '\033[1m')"
  DIM="$(printf '\033[2m')"
  RESET="$(printf '\033[0m')"
  BLUE="$(printf '\033[34m')"
  CYAN="$(printf '\033[36m')"
  GREEN="$(printf '\033[32m')"
  YELLOW="$(printf '\033[33m')"
  RED="$(printf '\033[31m')"
else
  BOLD=""
  DIM=""
  RESET=""
  BLUE=""
  CYAN=""
  GREEN=""
  YELLOW=""
  RED=""
fi

section() {
  printf '\n%s==> %s%s\n' "${BOLD}${BLUE}" "$1" "$RESET"
}

info() {
  printf '%s    %s%s\n' "$DIM" "$*" "$RESET"
}

ok() {
  printf '%sOK%s  %s\n' "$GREEN" "$RESET" "$*"
}

warn() {
  printf '%sWARN%s %s\n' "$YELLOW" "$RESET" "$*"
}

fail() {
  printf '%sERR%s  %s\n' "$RED" "$RESET" "$*" >&2
}

if [[ -f "$CONFIG_ABS" ]]; then
  ok "$CONFIG_PATH already exists."
  info "Run 'atlas configure' to edit it, or remove the file to re-run onboarding."
  exit 0
fi

if [[ ! -t 0 && "${ATLAS_INIT_ECOSYSTEM_INTERACTIVE:-false}" != "true" ]]; then
  cp "$ROOT_DIR/ecosystem/atlas.yaml.example" "$CONFIG_ABS"
  ok "Created $CONFIG_PATH from ecosystem/atlas.yaml.example."
  warn "Review it before running seed in production."
  exit 0
fi

trim() {
  local value="$1"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  printf '%s' "$value"
}

lowercase() {
  printf '%s' "$1" | tr '[:upper:]' '[:lower:]'
}

is_slug() {
  [[ "$1" =~ ^[A-Za-z0-9][A-Za-z0-9_-]*$ ]]
}

slugify() {
  local value
  value="$(lowercase "$1")"
  value="$(printf '%s' "$value" | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//')"
  value="${value%-atlas}"
  printf '%s' "${value:-household}"
}

yaml_quote() {
  local value="$1"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  printf '"%s"' "$value"
}

prompt_text() {
  local label="$1"
  local default_value="$2"
  local help_text="${3:-}"
  local answer

  if [[ -n "$help_text" ]]; then
    info "$help_text"
  fi

  if [[ -n "$default_value" ]]; then
    printf '%s%s%s [%s]: ' "$BOLD" "$label" "$RESET" "$default_value"
  else
    printf '%s%s%s: ' "$BOLD" "$label" "$RESET"
  fi

  read -r answer
  if [[ ! -t 0 ]]; then
    printf '\n'
  fi

  if [[ -z "$answer" ]]; then
    PROMPT_RESULT="$default_value"
  else
    PROMPT_RESULT="$(trim "$answer")"
  fi
}

prompt_slug() {
  local label="$1"
  local default_value="$2"
  local help_text="$3"

  while true; do
    prompt_text "$label" "$default_value" "$help_text"
    PROMPT_RESULT="$(lowercase "$PROMPT_RESULT")"
    if is_slug "$PROMPT_RESULT"; then
      return 0
    fi
    fail "Use letters, numbers, dashes, or underscores only. Example: household or parent-one."
  done
}

prompt_optional_phone() {
  local label="$1"
  local default_value="$2"
  local help_text="$3"

  while true; do
    prompt_text "$label" "$default_value" "$help_text"
    if [[ -z "$PROMPT_RESULT" || "$PROMPT_RESULT" =~ ^\+[0-9]{7,15}$ ]]; then
      return 0
    fi
    fail "Use E.164 format, for example +15551234567, or leave it blank."
  done
}

prompt_optional_url() {
  local label="$1"
  local default_value="$2"
  local help_text="$3"

  while true; do
    prompt_text "$label" "$default_value" "$help_text"
    if [[ -z "$PROMPT_RESULT" || "$PROMPT_RESULT" =~ ^https?:// ]]; then
      return 0
    fi
    fail "Enter a full http:// or https:// URL, or leave it blank."
  done
}

prompt_count() {
  local label="$1"
  local default_value="$2"
  local help_text="$3"

  while true; do
    prompt_text "$label" "$default_value" "$help_text"
    if [[ "$PROMPT_RESULT" =~ ^[0-9]+$ && "$PROMPT_RESULT" -ge 1 ]]; then
      return 0
    fi
    fail "Enter a positive whole number."
  done
}

prompt_choice() {
  local label="$1"
  local default_value="$2"
  local help_text="$3"
  local allowed_csv="$4"
  local normalized

  while true; do
    prompt_text "$label" "$default_value" "$help_text"
    normalized="$(lowercase "$PROMPT_RESULT")"
    if csv_contains "$allowed_csv" "$normalized"; then
      PROMPT_RESULT="$normalized"
      return 0
    fi
    fail "Choose one of: $allowed_csv"
  done
}

csv_contains() {
  local csv="$1"
  local needle="$2"
  local item
  IFS=',' read -r -a CSV_PARTS <<< "$csv"
  for item in "${CSV_PARTS[@]}"; do
    if [[ "$(trim "$item")" == "$needle" ]]; then
      return 0
    fi
  done
  return 1
}

array_contains() {
  local needle="$1"
  shift
  local item
  for item in "$@"; do
    if [[ "$item" == "$needle" ]]; then
      return 0
    fi
  done
  return 1
}

join_csv() {
  local first=true
  local item
  for item in "$@"; do
    if [[ "$first" == "true" ]]; then
      first=false
    else
      printf ','
    fi
    printf '%s' "$item"
  done
}

split_csv() {
  local raw="$1"
  local part
  PARSED_LIST=()
  if [[ -z "$raw" ]]; then
    return 0
  fi
  IFS=',' read -r -a CSV_PARTS <<< "$raw"
  for part in "${CSV_PARTS[@]}"; do
    part="$(trim "$part")"
    if [[ -n "$part" ]]; then
      PARSED_LIST+=("$part")
    fi
  done
}

parse_user_list() {
  local raw="$1"
  local user_id
  PARSED_LIST=()

  raw="$(lowercase "$(trim "$raw")")"
  if [[ -z "$raw" || "$raw" == "all" ]]; then
    PARSED_LIST=("${user_ids[@]}")
    return 0
  fi

  split_csv "$raw"
  for user_id in "${PARSED_LIST[@]}"; do
    if ! array_contains "$user_id" "${user_ids[@]}"; then
      fail "Unknown user id: $user_id"
      return 1
    fi
  done
}

parse_skills() {
  local raw="$1"
  local skill

  raw="$(lowercase "$(trim "$raw")")"
  case "$raw" in
    ""|default|all)
      PARSED_LIST=("${default_skills[@]}")
      return 0
      ;;
    minimal)
      PARSED_LIST=("${minimal_skills[@]}")
      return 0
      ;;
  esac

  split_csv "$raw"
  for skill in "${PARSED_LIST[@]}"; do
    if ! array_contains "$skill" "${available_skills[@]}"; then
      fail "Unknown capability: $skill"
      info "Available: $(join_csv "${available_skills[@]}")"
      return 1
    fi
  done
}

write_list_from_csv() {
  local indent="$1"
  local csv="$2"
  local item
  split_csv "$csv"
  for item in "${PARSED_LIST[@]}"; do
    printf '%*s- %s\n' "$indent" "" "$(yaml_quote "$item")"
  done
}

default_skills=(household planning calendar reminders health training nutrition location memory whatsapp)
minimal_skills=(household planning reminders memory whatsapp)
available_skills=(household planning calendar reminders health training nutrition location memory whatsapp)

section "Welcome"
printf '%sThis creates your local Atlas ecosystem file:%s %s\n' "$DIM" "$RESET" "$CONFIG_PATH"
printf '%sAtlas records your people, agents, bridge scopes, and approvals. It also generates Hermes WhatsApp allowlists from this file.%s\n' "$DIM" "$RESET"
printf '%sHermes is still the agent runtime. Hermes/provider auth, native skills, MCP, gateway, and memory-provider behavior stay with Hermes; Atlas generates profile customizations.%s\n' "$DIM" "$RESET"
printf '%sPress Enter to accept a default. You can edit this file later with:%s atlas configure\n' "$DIM" "$RESET"

section "1. Install label"
prompt_text "Install label" "Household Atlas" "Optional friendly label used in generated profile metadata and admin output. It is not the agent name, product name, auth setting, or persona. Press Enter to keep the default."
project_name="$PROMPT_RESULT"
project_id="${ATLAS_PROJECT_ID:-$(slugify "$project_name")}"
if ! is_slug "$project_id"; then
  project_id="$(slugify "$project_id")"
fi
info "Internal id for config files: $project_id"

section "2. Allowed people"
prompt_count "How many people should be allowed to use this Atlas?" "2" "These WhatsApp numbers become Hermes gateway allowlists. Senders not on the list are rejected by Hermes before the agent loop."
user_count="$PROMPT_RESULT"

user_ids=()
user_names=()
user_whatsapp_numbers=()

for index in $(seq 1 "$user_count"); do
  section "User $index of $user_count"

  default_user_id="user-$index"
  if [[ "$index" -eq 1 ]]; then
    default_user_id="parent-one"
  elif [[ "$index" -eq 2 ]]; then
    default_user_id="parent-two"
  fi

  prompt_slug "User id" "$default_user_id" "Internal stable id. Use a short slug like jose, parent-one, or alex."
  user_id="$PROMPT_RESULT"
  while [[ "${#user_ids[@]}" -gt 0 ]] && array_contains "$user_id" "${user_ids[@]}"; do
    fail "That user id is already used."
    prompt_slug "User id" "$user_id" "Choose a unique internal user id."
    user_id="$PROMPT_RESULT"
  done

  prompt_text "Display name" "User $index" "Name shown in admin output and agent context."
  display_name="$PROMPT_RESULT"

  prompt_optional_phone "WhatsApp number" "" "The person's WhatsApp number in E.164 format, for example +15551234567. Leave blank to add it later."
  whatsapp_number="$PROMPT_RESULT"

  user_ids+=("$user_id")
  user_names+=("$display_name")
  user_whatsapp_numbers+=("$whatsapp_number")
done

section "3. Agents"
info "An agent is the thing a user chats with. It can be shared, like a family agent, or personal."
info "Each agent gets:"
info "- a Hermes profile name, so Hermes knows which profile/config to run"
info "- a Honcho workspace, so memory stays scoped to that agent"
info "- Atlas capability switches, which generate a Hermes native skill for custom bridge/data facts"
prompt_count "How many agents should Atlas create now?" "1" "Start with one shared family agent unless you already know you want multiple."
agent_count="$PROMPT_RESULT"

agent_ids=()
agent_names=()
agent_types=()
agent_profiles=()
agent_workspaces=()
agent_runtime_urls=()
agent_members_csv=()
agent_owners_csv=()
agent_default_for_csv=()
agent_aliases_csv=()
agent_skills_csv=()

for index in $(seq 1 "$agent_count"); do
  section "Agent $index of $agent_count"

  default_agent_id="agent-$index"
  default_agent_name="Agent $index"
  if [[ "$index" -eq 1 ]]; then
    default_agent_id="household"
    default_agent_name="$project_name"
  fi

  prompt_slug "Agent id" "$default_agent_id" "Internal stable id for routing, memory, and profile generation."
  agent_id="$PROMPT_RESULT"
  while [[ "${#agent_ids[@]}" -gt 0 ]] && array_contains "$agent_id" "${agent_ids[@]}"; do
    fail "That agent id is already used."
    prompt_slug "Agent id" "$agent_id" "Choose a unique internal agent id."
    agent_id="$PROMPT_RESULT"
  done

  prompt_text "Agent display name" "$default_agent_name" "Name shown in generated configs and admin output."
  agent_name="$PROMPT_RESULT"

  prompt_choice "Agent type" "shared" "Use shared for a family/household agent. Use personal for an agent owned by one person." "shared,personal"
  agent_type="$PROMPT_RESULT"

  while true; do
    if [[ "$agent_type" == "shared" ]]; then
      prompt_text "Members allowed to use this agent" "all" "Enter all, or a comma-separated list of user ids: $(join_csv "${user_ids[@]}")"
    else
      prompt_text "Owner allowed to use this personal agent" "${user_ids[0]}" "Enter one user id, or a comma-separated list if this should be shared later."
    fi
    if parse_user_list "$PROMPT_RESULT"; then
      if [[ "${#PARSED_LIST[@]}" -gt 0 ]]; then
        members_csv="$(join_csv "${PARSED_LIST[@]}")"
        break
      fi
      fail "Choose at least one user."
    fi
  done

  split_csv "$members_csv"
  default_owner="${PARSED_LIST[0]}"
  while true; do
    prompt_text "Owner user id(s)" "$default_owner" "Owners can administer this agent. Usually this is the first adult user."
    if parse_user_list "$PROMPT_RESULT"; then
      owners_csv="$(join_csv "${PARSED_LIST[@]}")"
      break
    fi
  done

  prompt_text "Hermes profile name" "$agent_id" "This is the per-agent profile name Atlas passes to Hermes. Hermes auth/provider setup still happens in Hermes, not in Atlas .env."
  hermes_profile="$PROMPT_RESULT"

  prompt_text "Honcho memory workspace" "$hermes_profile" "Memory is isolated by workspace. Use a unique workspace per agent unless you intentionally want shared memory."
  honcho_workspace="$PROMPT_RESULT"

  prompt_optional_url "Hermes endpoint override" "" "Optional. Leave blank to use global HERMES_BASE_URL/HERMES_ENDPOINT_TEMPLATE. Set only if this agent should call a specific Hermes endpoint URL."
  runtime_url="$PROMPT_RESULT"

  default_aliases="$agent_id:,/$agent_id"
  if [[ "$index" -eq 1 ]]; then
    default_aliases="family:,/family,$agent_id:,/$agent_id"
  fi
  prompt_text "Routing aliases" "$default_aliases" "Optional chat prefixes users can type to target this agent. Enter none for no aliases."
  aliases_raw="$(lowercase "$(trim "$PROMPT_RESULT")")"
  if [[ "$aliases_raw" == "none" ]]; then
    aliases_csv=""
  else
    aliases_csv="$PROMPT_RESULT"
  fi

  while true; do
    prompt_text "Atlas capabilities" "default" "These generate a Hermes native skill for Atlas custom data surfaces; they are not persona text. Use default, minimal, all, or comma-separated ids. Default: $(join_csv "${default_skills[@]}")"
    if parse_skills "$PROMPT_RESULT"; then
      skills_csv="$(join_csv "${PARSED_LIST[@]}")"
      break
    fi
  done

  agent_ids+=("$agent_id")
  agent_names+=("$agent_name")
  agent_types+=("$agent_type")
  agent_profiles+=("$hermes_profile")
  agent_workspaces+=("$honcho_workspace")
  agent_runtime_urls+=("$runtime_url")
  agent_members_csv+=("$members_csv")
  agent_owners_csv+=("$owners_csv")
  agent_default_for_csv+=("$members_csv")
  agent_aliases_csv+=("$aliases_csv")
  agent_skills_csv+=("$skills_csv")
done

section "4. WhatsApp routing"
info "Only allowlisted WhatsApp numbers can talk to Hermes through the generated gateway config."
info "The default agent is where that person's normal WhatsApp messages go unless they use an alias."

user_default_agents=()
for index in "${!user_ids[@]}"; do
  user_id="${user_ids[$index]}"
  whatsapp_number="${user_whatsapp_numbers[$index]}"
  default_agent="${agent_ids[0]}"

  if [[ -z "$whatsapp_number" ]]; then
    user_default_agents+=("")
    warn "${user_names[$index]} has no WhatsApp number yet; no channel allowlist will be written for this user."
    continue
  fi

  for agent_index in "${!agent_ids[@]}"; do
    split_csv "${agent_members_csv[$agent_index]}"
    if array_contains "$user_id" "${PARSED_LIST[@]}"; then
      default_agent="${agent_ids[$agent_index]}"
      break
    fi
  done

  while true; do
    prompt_text "Default WhatsApp agent for ${user_names[$index]}" "$default_agent" "Available agents: $(join_csv "${agent_ids[@]}")"
    if array_contains "$PROMPT_RESULT" "${agent_ids[@]}"; then
      user_default_agents+=("$PROMPT_RESULT")
      break
    fi
    fail "Choose one of: $(join_csv "${agent_ids[@]}")"
  done
done

mkdir -p "$(dirname "$CONFIG_ABS")"

{
  cat <<YAML
version: 1

project:
  id: $(yaml_quote "$project_id")
  name: $(yaml_quote "$project_name")

users:
YAML

  for index in "${!user_ids[@]}"; do
    user_id="${user_ids[$index]}"
    display_name="${user_names[$index]}"
    whatsapp_number="${user_whatsapp_numbers[$index]}"
    default_agent="${user_default_agents[$index]}"

    cat <<YAML
  - id: $(yaml_quote "$user_id")
    displayName: $(yaml_quote "$display_name")
YAML

    if [[ -n "$whatsapp_number" ]]; then
      cat <<YAML
    identities:
      - channel: whatsapp
        externalId: $(yaml_quote "$whatsapp_number")
        defaultAgent: $(yaml_quote "$default_agent")

YAML
    else
      cat <<'YAML'
    identities: []

YAML
    fi
  done

  cat <<'YAML'
agents:
YAML

  for index in "${!agent_ids[@]}"; do
    agent_id="${agent_ids[$index]}"
    agent_name="${agent_names[$index]}"
    agent_type="${agent_types[$index]}"
    hermes_profile="${agent_profiles[$index]}"
    honcho_workspace="${agent_workspaces[$index]}"
    runtime_url="${agent_runtime_urls[$index]}"
    members_csv="${agent_members_csv[$index]}"
    owners_csv="${agent_owners_csv[$index]}"
    default_for_csv="${agent_default_for_csv[$index]}"
    aliases_csv="${agent_aliases_csv[$index]}"
    skills_csv="${agent_skills_csv[$index]}"

    cat <<YAML
  - id: $(yaml_quote "$agent_id")
    displayName: $(yaml_quote "$agent_name")
    type: $(yaml_quote "$agent_type")
    # Hermes auth/provider setup is handled by Hermes. Atlas only names the profile.
    hermesProfile: $(yaml_quote "$hermes_profile")
    # Honcho memory is isolated by workspace.
    honchoWorkspace: $(yaml_quote "$honcho_workspace")
    owners:
YAML
    write_list_from_csv 6 "$owners_csv"

    cat <<'YAML'
    members:
YAML
    write_list_from_csv 6 "$members_csv"

    cat <<'YAML'
    routing:
      defaultFor:
YAML
    write_list_from_csv 8 "$default_for_csv"

    if [[ -n "$aliases_csv" ]]; then
      cat <<'YAML'
      aliases:
YAML
      write_list_from_csv 8 "$aliases_csv"
    else
      cat <<'YAML'
      aliases: []
YAML
    fi

    if [[ -n "$runtime_url" ]]; then
      cat <<YAML
    runtime:
      url: $(yaml_quote "$runtime_url")
YAML
    else
      cat <<'YAML'
    runtime: {}
YAML
    fi

    cat <<'YAML'
    skills:
YAML
    write_list_from_csv 6 "$skills_csv"
  done
} > "$CONFIG_ABS"

chmod 600 "$CONFIG_ABS"

section "Ecosystem config created"
ok "Created $CONFIG_PATH."
info "Review it any time with: atlas configure"
info "Hermes profile files and native Atlas capability skills are generated later by: atlas profiles or atlas apply"
info "Start the Hermes runtime when ready with: atlas runtime"
