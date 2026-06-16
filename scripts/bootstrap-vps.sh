#!/usr/bin/env bash
set -euo pipefail

ATLAS_REPO_URL="${ATLAS_REPO_URL:-https://github.com/itspalomo/project-atlas.git}"
ATLAS_BRANCH="${ATLAS_BRANCH:-main}"
ATLAS_DIR="${ATLAS_DIR:-/opt/project-atlas}"
ATLAS_RUN_INSTALL="${ATLAS_RUN_INSTALL:-true}"

SUDO=""
if [[ "$(id -u)" -ne 0 ]]; then
  SUDO="sudo"
fi

INSTALL_SUDO=""

install_bootstrap_deps() {
  if command -v apt-get >/dev/null 2>&1; then
    $SUDO apt-get update
    $SUDO apt-get install -y ca-certificates curl git openssl
  elif ! command -v git >/dev/null 2>&1; then
    echo "git is required. Install git or use an Ubuntu/Debian host with apt-get."
    exit 1
  fi
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

run_install() {
  if [[ "$ATLAS_RUN_INSTALL" != "true" ]]; then
    echo "Skipping install because ATLAS_RUN_INSTALL=$ATLAS_RUN_INSTALL."
    return 0
  fi

  if [[ -r /dev/tty ]]; then
    scripts/atlasctl install < /dev/tty
  else
    scripts/atlasctl install
  fi
}

install_bootstrap_deps
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

cd "$ATLAS_DIR"

if [[ ! -f .env ]]; then
  cp .env.example .env
  chmod 600 .env
fi

for key in \
  ATLAS_PUBLIC_BASE_URL \
  TAILSCALE_AUTH_KEY \
  TAILSCALE_HOSTNAME \
  WHATSAPP_PHONE_NUMBER_ID \
  WHATSAPP_ACCESS_TOKEN \
  WHATSAPP_APP_SECRET \
  WHATSAPP_VERIFY_TOKEN \
  WHATSAPP_SEND_UNAUTHORIZED_REPLY \
  ATLAS_RUNTIME_MODE \
  HERMES_BASE_URL \
  HERMES_ENDPOINT_TEMPLATE \
  HERMES_MODEL; do
  set_env_if_present "$key"
done

scripts/atlasctl install-cli
run_install

cat <<MSG
Atlas bootstrap complete.

Project directory:
  $ATLAS_DIR

CLI:
  atlas status
  atlas configure
  atlas apply
  atlas logs atlas-api
  atlas runtime
  atlas webhook

Config files:
  $ATLAS_DIR/.env
  $ATLAS_DIR/ecosystem/atlas.yaml
MSG
