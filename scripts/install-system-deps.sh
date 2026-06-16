#!/usr/bin/env bash
set -euo pipefail

if ! command -v apt-get >/dev/null 2>&1; then
  echo "Skipping apt package install because apt-get is not available."
  exit 0
fi

SUDO=""
if [[ "$(id -u)" -ne 0 ]]; then
  SUDO="sudo"
fi

install_missing_packages() {
  local missing=()

  for package_name in "$@"; do
    if ! dpkg-query -W -f='${Status}' "$package_name" 2>/dev/null | grep -q "install ok installed"; then
      missing+=("$package_name")
    fi
  done

  if [[ "${#missing[@]}" -gt 0 ]]; then
    $SUDO apt-get update
    $SUDO apt-get install -y "${missing[@]}"
  fi
}

install_missing_packages ca-certificates curl gnupg git openssl

if ! command -v docker >/dev/null 2>&1; then
  $SUDO install -m 0755 -d /etc/apt/keyrings
  if [[ ! -f /etc/apt/keyrings/docker.gpg ]]; then
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | $SUDO gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  fi
  $SUDO chmod a+r /etc/apt/keyrings/docker.gpg
  . /etc/os-release
  if [[ ! -f /etc/apt/sources.list.d/docker.list ]]; then
    echo \
      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
      ${VERSION_CODENAME} stable" | $SUDO tee /etc/apt/sources.list.d/docker.list >/dev/null
  fi
  install_missing_packages docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  docker_user="${SUDO_USER:-$USER}"
  if [[ -n "$docker_user" && "$docker_user" != "root" ]]; then
    $SUDO usermod -aG docker "$docker_user" || true
  fi
else
  echo "Docker is already installed."
fi
