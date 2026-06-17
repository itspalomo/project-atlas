# Atlas CLI

`atlas` is a thin wrapper around the repository scripts and Docker Compose workflows. Run `scripts/atlasctl install-cli` from a checkout to install or refresh the global command.

| Command | What it does |
| --- | --- |
| `atlas install` | Runs `scripts/install.sh` for the current checkout. It creates `.env` when missing, creates the ecosystem config when missing, installs Linux host dependencies when applicable, prepares Honcho, runs migrations/seeding, generates Hermes profiles, and starts the base Atlas API stack. |
| `atlas configure` | Opens `.env`, ensures `ecosystem/atlas.yaml` exists, then opens the ecosystem config. Use this to edit users, Hermes profiles, profile membership, runtime groups, Honcho workspaces, and Atlas custom capabilities. |
| `atlas init` | Creates `ecosystem/atlas.yaml` if missing. In a terminal it prompts for users and a shared agent; without a terminal it copies `ecosystem/atlas.yaml.example`. |
| `atlas apply` | Applies the current config without reinstalling host dependencies: runs migrations, seeds Atlas users/agents/memberships, regenerates Hermes profile support files, and restarts Atlas API. |
| `atlas install-cli` | Installs or refreshes the `atlas` command symlink. Uses `/usr/local/bin/atlas` when writable/root, otherwise falls back to `$HOME/.local/bin/atlas` unless `ATLAS_CLI_PATH` is set. |
| `atlas doctor` | Prints repo/config presence, Git/Docker/Tailscale status, Compose service status, and local API health checks. |
| `atlas up` or `atlas start` | Starts the base Docker Compose services with a rebuild. |
| `atlas down` or `atlas stop` | Stops the Docker Compose services. |
| `atlas restart` | Rebuilds and restarts only `atlas-api`. |
| `atlas status` | Shows Docker Compose service status and checks `/health` and `/ready` on the local API port. |
| `atlas logs [service]` | Tails Compose logs for all services, or one service such as `atlas-api`. |
| `atlas update` | Pulls the latest Git changes with `git pull --ff-only`, then reruns the installer. |
| `atlas migrate` | Runs database migrations through the `atlas-api` container. |
| `atlas seed` | Seeds configured users, agents, memberships, and optional identity metadata from `ecosystem/atlas.yaml`. |
| `atlas profiles` | Merges Atlas-managed Hermes `config.yaml` settings, updates the native `skills/atlas-context/SKILL.md`, writes `atlas-capabilities.json`, Honcho config, MCP config, and the generated runtime Compose override from the ecosystem config. |
| `atlas runtime` | Regenerates Hermes profiles and starts all configured Hermes runtime groups. |
| `atlas runtime-off` | Stops the Hermes runtime service. |
| `atlas honcho` | Clones/prepares self-hosted Honcho and starts its Compose services. |
| `atlas webhook` | Publishes Hermes' WhatsApp Cloud webhook path through Tailscale Funnel. |
| `atlas webhook-status` | Shows current Tailscale Funnel status. |
| `atlas webhook-off` | Disables the configured Tailscale Funnel webhook path. |

Most service/data commands expect Docker Compose to be available and should be run from a configured checkout.
