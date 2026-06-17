#!/usr/bin/env bash
set -euo pipefail

ATLAS_REPO_URL="${ATLAS_REPO_URL:-https://github.com/itspalomo/project-atlas.git}"
ATLAS_BRANCH="${ATLAS_BRANCH:-main}"
ATLAS_RUN_INSTALL="${ATLAS_RUN_INSTALL:-true}"
ATLAS_INSTALL_CLI="${ATLAS_INSTALL_CLI:-true}"
ATLAS_COLOR="${ATLAS_COLOR:-auto}"

if [[ "${ATLAS_COLOR}" == "always" ]] || { [[ "${ATLAS_COLOR}" == "auto" && -t 1 && -z "${NO_COLOR:-}" && "${TERM:-}" != "dumb" ]]; }; then
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

print_banner() {
  if [[ "${ATLAS_INSTALL_BANNER_PRINTED:-}" == "true" ]]; then
    return 0
  fi

  export ATLAS_INSTALL_BANNER_PRINTED=true
  printf '\n%sProject Atlas Installer%s\n' "${BOLD}${BLUE}" "$RESET"
  printf '%sPrivate Hermes + Honcho + WhatsApp runtime setup%s\n\n' "$DIM" "$RESET"
}

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

run_command() {
  local label="$1"
  shift

  section "$label"
  "$@"
  ok "$label complete."
}

on_error() {
  local status=$?
  fail "Install failed with exit code $status."
  info "Re-run with ATLAS_COLOR=never if you need plain logs."
  exit "$status"
}

trap on_error ERR

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
  section "Checking installer prerequisites"

  case "$(uname -s)" in
    Linux)
      if command -v apt-get >/dev/null 2>&1; then
        info "Installing base packages with apt-get."
        $SUDO apt-get update
        $SUDO apt-get install -y ca-certificates curl git openssl
        ok "Base packages are installed."
      elif ! command -v git >/dev/null 2>&1; then
        fail "git is required. Install git before running install.sh."
        exit 1
      else
        ok "git is available."
      fi
      ;;
    Darwin)
      if ! command -v git >/dev/null 2>&1; then
        fail "git is required. Install Xcode Command Line Tools with: xcode-select --install"
        exit 1
      else
        ok "git is available."
        info "Skipping Linux package setup on macOS."
      fi
      ;;
    *)
      if ! command -v git >/dev/null 2>&1; then
        fail "git is required. Install git before running install.sh."
        exit 1
      else
        ok "git is available."
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
    fail "$writable_path is not writable and sudo is not installed."
    exit 1
  fi

  INSTALL_SUDO="sudo"
  info "Using sudo for checkout writes under $writable_path."
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

  ENV_OVERRIDES_APPLIED=$((ENV_OVERRIDES_APPLIED + 1))
}

apply_env_overrides() {
  ENV_OVERRIDES_APPLIED=0

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
    WHATSAPP_CLOUD_PHONE_NUMBER_ID \
    WHATSAPP_CLOUD_ACCESS_TOKEN \
    WHATSAPP_CLOUD_APP_SECRET \
    WHATSAPP_CLOUD_VERIFY_TOKEN \
    WHATSAPP_CLOUD_WEBHOOK_HOST \
    WHATSAPP_CLOUD_WEBHOOK_PORT \
    WHATSAPP_CLOUD_WEBHOOK_PATH \
    WHATSAPP_CLOUD_API_VERSION \
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

  if [[ "$ENV_OVERRIDES_APPLIED" -gt 0 ]]; then
    ok "Applied $ENV_OVERRIDES_APPLIED environment override(s) to .env."
  else
    info "No environment overrides were provided."
  fi
}

print_checkout_ready() {
  section "Checkout ready"
  ok "Atlas checkout is ready."

  printf '\n%sProject directory:%s\n  %s\n' "${BOLD}${CYAN}" "$RESET" "$ATLAS_DIR"

  warn "Install was skipped because ATLAS_RUN_INSTALL=$ATLAS_RUN_INSTALL."
  printf '\n%sRun this when ready:%s\n' "${BOLD}${CYAN}" "$RESET"
  cat <<MSG
  cd "$ATLAS_DIR"
  scripts/install.sh
MSG
}

clone_or_update_checkout() {
  install_prerequisites
  configure_install_privileges

  section "Preparing Atlas checkout"
  info "Repository: $ATLAS_REPO_URL"
  info "Branch: $ATLAS_BRANCH"
  info "Directory: $ATLAS_DIR"

  $INSTALL_SUDO mkdir -p "$(dirname "$ATLAS_DIR")"

  if [[ -d "$ATLAS_DIR/.git" ]]; then
    info "Updating existing checkout."
    $INSTALL_SUDO git -C "$ATLAS_DIR" fetch origin "$ATLAS_BRANCH"
    $INSTALL_SUDO git -C "$ATLAS_DIR" checkout "$ATLAS_BRANCH"
    $INSTALL_SUDO git -C "$ATLAS_DIR" pull --ff-only origin "$ATLAS_BRANCH"
  elif [[ -e "$ATLAS_DIR" ]]; then
    fail "$ATLAS_DIR exists but is not a git checkout."
    info "Set ATLAS_DIR to another path or remove the existing directory."
    exit 1
  else
    info "Cloning repository."
    $INSTALL_SUDO git clone --branch "$ATLAS_BRANCH" "$ATLAS_REPO_URL" "$ATLAS_DIR"
  fi

  if [[ "$INSTALL_SUDO" == "sudo" && -n "${SUDO_USER:-}" && "$SUDO_USER" != "root" ]]; then
    $INSTALL_SUDO chown -R "$SUDO_USER":"$SUDO_USER" "$ATLAS_DIR"
  fi

  ok "Checkout is ready."
}

install_from_checkout() {
  local root_dir="$1"

  cd "$root_dir"

  section "Preparing local configuration"
  info "Project directory: $root_dir"

  if [[ ! -f .env ]]; then
    cp .env.example .env
    chmod 600 .env
    ok "Created .env from .env.example."
  else
    ok ".env already exists."
  fi

  apply_env_overrides

  if [[ "$ATLAS_INSTALL_CLI" == "true" ]]; then
    run_command "Installing atlas CLI" scripts/atlasctl install-cli
  else
    warn "Skipping atlas CLI install because ATLAS_INSTALL_CLI=$ATLAS_INSTALL_CLI."
  fi

  if [[ "$ATLAS_RUN_INSTALL" != "true" ]]; then
    ATLAS_DIR="$root_dir"
    print_checkout_ready
    return 0
  fi

  run_command "Initializing ecosystem config" scripts/init-ecosystem.sh

  if [[ "$(uname -s)" == "Linux" ]]; then
    run_command "Installing Linux system dependencies" scripts/install-system-deps.sh
    run_command "Checking Tailscale" scripts/install-tailscale.sh
  else
    section "Checking host services"
    info "Skipping Linux system dependency and Tailscale setup on $(uname -s)."
  fi

  if grep -Eq 'change-me-generate-with-openssl|POSTGRES_PASSWORD=$|ATLAS_BRIDGE_API_KEY=$|WHATSAPP_VERIFY_TOKEN=$|WHATSAPP_CLOUD_VERIFY_TOKEN=$' .env; then
    run_command "Rotating local placeholder secrets" scripts/rotate-local-secrets.sh
  else
    section "Checking local secrets"
    ok "Local secrets are already populated."
  fi

  run_command "Preparing self-hosted Honcho" scripts/install-honcho.sh --prepare

  run_command "Starting data and memory services" docker compose up -d --build postgres honcho-api honcho-deriver
  run_command "Building Atlas API" docker compose build atlas-api
  run_command "Applying database migrations" docker compose run --rm atlas-api node dist/db/migrate.js
  run_command "Seeding users, agents, and identity metadata" docker compose run --rm atlas-api node dist/db/seed.js
  run_command "Generating Hermes profiles" scripts/init-hermes-profiles.sh
  run_command "Starting Atlas API" docker compose up -d --build atlas-api

  section "Install complete"
  ok "Project Atlas base services are running."

  printf '\n%sNext steps:%s\n' "${BOLD}${CYAN}" "$RESET"
  cat <<'MSG'
  1. Configure Hermes WhatsApp Cloud values in .env or by running Hermes' whatsapp-cloud setup.
  2. Start Hermes:
     atlas runtime
     If the global CLI is not installed yet:
     scripts/atlasctl runtime
  3. Publish the Hermes WhatsApp webhook through Tailscale Funnel:
     atlas webhook
     If the global CLI is not installed yet:
     scripts/atlasctl webhook
  4. Use the printed Funnel URL as the Meta webhook callback URL.
MSG
}

print_banner
root_dir="$(discover_root_dir || true)"

if [[ -z "$root_dir" ]]; then
  clone_or_update_checkout
  cd "$ATLAS_DIR"

  if [[ "$ATLAS_RUN_INSTALL" != "true" ]]; then
    section "Preparing local configuration"
    info "Project directory: $ATLAS_DIR"

    if [[ ! -f .env ]]; then
      cp .env.example .env
      chmod 600 .env
      ok "Created .env from .env.example."
    else
      ok ".env already exists."
    fi

    apply_env_overrides

    if [[ "$ATLAS_INSTALL_CLI" == "true" ]]; then
      run_command "Installing atlas CLI" scripts/atlasctl install-cli
    else
      warn "Skipping atlas CLI install because ATLAS_INSTALL_CLI=$ATLAS_INSTALL_CLI."
    fi

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
