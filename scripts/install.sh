#!/usr/bin/env bash
set -euo pipefail

ATLAS_REPO_URL="${ATLAS_REPO_URL:-https://github.com/itspalomo/project-atlas.git}"
ATLAS_BRANCH="${ATLAS_BRANCH:-main}"
ATLAS_RUN_INSTALL="${ATLAS_RUN_INSTALL:-true}"
ATLAS_INSTALL_CLI="${ATLAS_INSTALL_CLI:-true}"

default_atlas_dir() {
  case "$(uname -s)" in
    Linux)
      printf '%s\n' "/opt/project-atlas"
      ;;
    *)
      printf '%s\n' "${HOME:-$PWD}/project-atlas"
      ;;
  esac
}

ATLAS_DIR="${ATLAS_DIR:-$(default_atlas_dir)}"

SUDO=""
if [[ "$(id -u)" -ne 0 ]]; then
  SUDO="sudo"
fi

INSTALL_SUDO=""

discover_root_dir() {
  local source
  local source_dir

  source="${BASH_SOURCE[0]:-}"

  if [[ -n "$source" && -f "$source" ]]; then
    source_dir="$(cd -P "$(dirname "$source")" && pwd)"
    if [[ -f "$source_dir/../.env.example" && -x "$source_dir/atlasctl" ]]; then
      cd -P "$source_dir/.."
      pwd
      return 0
    fi
  fi

  if [[ -f .env.example && -x scripts/atlasctl && -f scripts/install.sh ]]; then
    pwd -P
    return 0
  fi

  return 1
}

install_prerequisites() {
  case "$(uname -s)" in
    Linux)
      if command -v apt-get >/dev/null 2>&1; then
        $SUDO apt-get update
        $SUDO apt-get install -y ca-certificates curl git openssl
      elif ! command -v git >/dev/null 2>&1; then
        echo "git is required. Install git before running install.sh."
        exit 1
      fi
      ;;
    Darwin)
      if ! command -v git >/dev/null 2>&1; then
        echo "git is required. Install Xcode Command Line Tools with: xcode-select --install"
        exit 1
      fi
      ;;
    *)
      if ! command -v git >/dev/null 2>&1; then
        echo "git is required. Install git before running install.sh."
        exit 1
      fi
      ;;
  esac
}

existing_ancestor() {
  local path="$1"
  while [[ ! -e "$path" && "$path" != "/" ]]; do
    path="$(dirname "$path")"
  done
  printf '%s\n' "$path"
}

configure_install_privileges() {
  local parent
  local writable_path

  if [[ "$(id -u)" -eq 0 ]]; then
    INSTALL_SUDO=""
    return 0
  fi

  if [[ -e "$ATLAS_DIR" ]]; then
    writable_path="$ATLAS_DIR"
  else
    parent="$(dirname "$ATLAS_DIR")"
    writable_path="$(existing_ancestor "$parent")"
  fi

  if [[ -w "$writable_path" ]]; then
    INSTALL_SUDO=""
    return 0
  fi

  if ! command -v sudo >/dev/null 2>&1; then
    echo "$writable_path is not writable and sudo is not installed."
    exit 1
  fi

  INSTALL_SUDO="sudo"
}

set_env_if_present() {
  local key="$1"
  local value="${!key:-}"

  if [[ -z "$value" ]]; then
    return 0
  fi

  if grep -q "^${key}=" .env; then
    KEY="$key" VALUE="$value" perl -0pi -e 's/^\Q$ENV{KEY}\E=.*/$ENV{KEY} . "=" . $ENV{VALUE}/gem' .env
  else
    printf '%s=%s\n' "$key" "$value" >> .env
  fi
}

apply_env_overrides() {
  for key in \
    NODE_ENV \
    LOG_LEVEL \
    ATLAS_API_HOST \
    ATLAS_API_PORT \
    ATLAS_PUBLIC_BASE_URL \
    ATLAS_API_BIND \
    POSTGRES_DB \
    POSTGRES_USER \
    POSTGRES_PASSWORD \
    DATABASE_URL \
    ATLAS_ECOSYSTEM_CONFIG \
    WHATSAPP_GRAPH_API_VERSION \
    WHATSAPP_PHONE_NUMBER_ID \
    WHATSAPP_ACCESS_TOKEN \
    WHATSAPP_APP_SECRET \
    WHATSAPP_VERIFY_TOKEN \
    WHATSAPP_SEND_UNAUTHORIZED_REPLY \
    WHATSAPP_REQUEST_TIMEOUT_MS \
    ATLAS_RUNTIME_MODE \
    HERMES_BASE_URL \
    HERMES_ENDPOINT_TEMPLATE \
    HERMES_MODEL \
    HERMES_DASHBOARD_PORT \
    HERMES_GATEWAY_PORT \
    HONCHO_SOURCE_DIR \
    HONCHO_AUTO_UPDATE \
    HONCHO_BASE_URL \
    HONCHO_API_KEY \
    HONCHO_HOST_PORT \
    HONCHO_AUTH_USE_AUTH \
    HONCHO_AUTH_JWT_SECRET \
    LLM_OPENAI_API_KEY \
    LLM_ANTHROPIC_API_KEY \
    LLM_GEMINI_API_KEY \
    ATLAS_BRIDGE_API_KEY \
    TAILSCALE_AUTH_KEY \
    TAILSCALE_HOSTNAME \
    TAILSCALE_FUNNEL_PORT \
    TAILSCALE_FUNNEL_PATH \
    TAILSCALE_FUNNEL_TARGET; do
    set_env_if_present "$key"
  done
}

print_checkout_ready() {
  cat <<MSG
Atlas checkout is ready.

Project directory:
  $ATLAS_DIR

Install was skipped because ATLAS_RUN_INSTALL=$ATLAS_RUN_INSTALL.
Run this when ready:
  cd "$ATLAS_DIR"
  scripts/install.sh
MSG
}

clone_or_update_checkout() {
  install_prerequisites
  configure_install_privileges

  $INSTALL_SUDO mkdir -p "$(dirname "$ATLAS_DIR")"

  if [[ -d "$ATLAS_DIR/.git" ]]; then
    echo "Updating existing Atlas checkout at $ATLAS_DIR."
    $INSTALL_SUDO git -C "$ATLAS_DIR" fetch origin "$ATLAS_BRANCH"
    $INSTALL_SUDO git -C "$ATLAS_DIR" checkout "$ATLAS_BRANCH"
    $INSTALL_SUDO git -C "$ATLAS_DIR" pull --ff-only origin "$ATLAS_BRANCH"
  elif [[ -e "$ATLAS_DIR" ]]; then
    echo "$ATLAS_DIR exists but is not a git checkout."
    echo "Set ATLAS_DIR to another path or remove the existing directory."
    exit 1
  else
    echo "Cloning Atlas into $ATLAS_DIR."
    $INSTALL_SUDO git clone --branch "$ATLAS_BRANCH" "$ATLAS_REPO_URL" "$ATLAS_DIR"
  fi

  if [[ "$INSTALL_SUDO" == "sudo" && -n "${SUDO_USER:-}" && "$SUDO_USER" != "root" ]]; then
    $INSTALL_SUDO chown -R "$SUDO_USER":"$SUDO_USER" "$ATLAS_DIR"
  fi
}

install_from_checkout() {
  local root_dir="$1"

  cd "$root_dir"

  if [[ ! -f .env ]]; then
    cp .env.example .env
    chmod 600 .env
  fi

  apply_env_overrides

  if [[ "$ATLAS_INSTALL_CLI" == "true" ]]; then
    scripts/atlasctl install-cli
  fi

  if [[ "$ATLAS_RUN_INSTALL" != "true" ]]; then
    ATLAS_DIR="$root_dir"
    print_checkout_ready
    return 0
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
2. Publish the webhook through Tailscale Funnel with: atlas webhook
   If the global CLI is not installed yet, run: scripts/atlasctl webhook
3. Use the printed Funnel URL as the Meta webhook callback URL.
4. Start Hermes with: atlas runtime
   If the global CLI is not installed yet, run: scripts/atlasctl runtime
MSG
}

root_dir="$(discover_root_dir || true)"

if [[ -z "$root_dir" ]]; then
  clone_or_update_checkout
  cd "$ATLAS_DIR"

  if [[ ! -f .env ]]; then
    cp .env.example .env
    chmod 600 .env
  fi

  apply_env_overrides

  if [[ "$ATLAS_INSTALL_CLI" == "true" ]]; then
    scripts/atlasctl install-cli
  fi

  if [[ "$ATLAS_RUN_INSTALL" != "true" ]]; then
    print_checkout_ready
    exit 0
  fi

  if [[ -r /dev/tty ]]; then
    scripts/install.sh < /dev/tty
  else
    scripts/install.sh
  fi

  exit 0
fi

install_from_checkout "$root_dir"
