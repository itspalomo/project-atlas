# Deployment

Target host:

- Ubuntu 24.04 VPS on Hostinger, DigitalOcean, or similar.
- Docker Compose.
- Tailscale for private administration.
- Tailscale Funnel for the public Hermes WhatsApp Cloud webhook.
- Runtime model auth configured through your selected Hermes provider. If you use Hermes/OpenAI auth provider, no `LLM_*` key is required in Atlas `.env`.

## One-Command Install

Once the repository is public or otherwise reachable from the VPS, run:

```bash
curl -fsSL https://raw.githubusercontent.com/itspalomo/project-atlas/main/scripts/install.sh | sudo bash
```

To pass common non-interactive settings up front:

```bash
curl -fsSL https://raw.githubusercontent.com/itspalomo/project-atlas/main/scripts/install.sh \
  | sudo env \
      TAILSCALE_AUTH_KEY=tskey-auth-... \
      TAILSCALE_HOSTNAME=project-atlas \
      WHATSAPP_CLOUD_VERIFY_TOKEN=replace-me \
      bash
```

On macOS, test the clone/config/CLI path without starting services:

```bash
curl -fsSL https://raw.githubusercontent.com/itspalomo/project-atlas/main/scripts/install.sh \
  | ATLAS_DIR="$HOME/project-atlas-test" ATLAS_RUN_INSTALL=false bash
```

The install script works in two modes. When run outside a checkout, including through `curl | bash`, it installs base package dependencies where supported, clones or updates Atlas, creates `.env` from `.env.example` when missing, copies supported environment overrides into `.env`, installs the `atlas` CLI, and runs the local installer. When run inside a checkout, it installs that checkout directly.

After editing `.env` or `ecosystem/atlas.yaml`, run `atlas apply` to rerun migrations, converge seeded identity metadata and agents, regenerate Hermes profile assets, native skill files, MCP config, Honcho config, and gateway allowlists, and restart Atlas API.

Use the CLI after install:

```bash
atlas status
atlas configure
atlas apply
atlas logs atlas-api
atlas webhook
atlas runtime
atlas update
```

For a manual checkout, run `scripts/install.sh` or `scripts/atlasctl install` from the repository root.

The installer:

1. Installs Docker on Linux when missing.
2. Checks Tailscale, skips setup when already connected, or installs/authenticates when needed.
3. Creates `ecosystem/atlas.yaml` if missing.
4. Rotates placeholder local secrets in `.env`.
5. Clones upstream Honcho into `vendor/honcho`.
6. Starts Atlas PostgreSQL and self-hosted Honcho.
7. Runs migrations.
8. Seeds users, agents, channel identity metadata, and membership from `ecosystem/atlas.yaml`.
9. Generates Hermes profile assets, native Atlas capability skills, MCP config, gateway allowlists, and native Honcho memory-provider configs.
10. Starts Atlas API.

Installer environment knobs:

- `ATLAS_REPO_URL`: Git repository URL, default `https://github.com/itspalomo/project-atlas.git`.
- `ATLAS_BRANCH`: Git branch, default `main`.
- `ATLAS_DIR`: Install directory, default `/opt/project-atlas` on Linux and `$HOME/project-atlas` elsewhere.
- `ATLAS_RUN_INSTALL`: Set to `false` to only clone/update, create `.env`, and install the CLI.
- `ATLAS_INSTALL_CLI`: Set to `false` to skip installing the `atlas` CLI symlink.
- `ATLAS_CLI_PATH`: Override where the `atlas` CLI symlink is installed.
- `ATLAS_COLOR`: Installer color mode. Use `auto`, `always`, or `never`. `NO_COLOR` is also respected.

## Idempotency

The installer is safe to rerun:

- `.env` is created only when missing.
- Local placeholder secrets are rotated only while they still contain placeholder values.
- Tailscale setup is skipped when the node is already connected.
- Honcho source is cloned only when missing. Existing source is reused unless `HONCHO_AUTO_UPDATE=true`.
- Database migrations run once through `schema_migrations`.
- Seeding converges access control to `ecosystem/atlas.yaml`: stale memberships are removed, stale configured-user WhatsApp identities are disabled, and removed users lose enabled channel access.
- Hermes profile generation rewrites configured profiles and removes stale generated profile directories from the prior manifest.

## Ecosystem Config

The local ecosystem file controls identity metadata, agents, bridge scopes, and generated runtime config. Atlas writes Hermes WhatsApp gateway allowlists, native skill files, MCP config, and Honcho memory-provider config from this file. Hermes remains the runtime and handles model/provider auth, WhatsApp sender allowlists, native skills, MCP discovery, and native memory-provider integration.

If `ecosystem/atlas.yaml` does not exist, the installer opens an onboarding questionnaire. It asks for an optional install label, allowed users, WhatsApp numbers, shared or personal agents, Hermes profile names, optional legacy Hermes endpoint overrides, Honcho memory workspaces, and enabled Atlas bridge capabilities. It does not ask for OpenAI or LLM provider keys; those stay with the Hermes/runtime auth provider.

```yaml
users:
  - id: parent-one
    displayName: Parent One
    identities:
      - channel: whatsapp
        externalId: "+15551234567"
        defaultAgent: household

agents:
  - id: household
    displayName: Household Atlas
    type: shared
    honchoWorkspace: household
    members:
      - parent-one
    routing:
      defaultFor:
        - parent-one
      aliases:
        - "family:"
        - "/family"
    # Atlas custom capability ids. These generate a Hermes native atlas-context skill.
    skills:
      - household
      - planning
      - calendar
      - reminders
      - health
      - training
      - nutrition
      - location
      - memory
      - whatsapp
```

## Runtime

Start Hermes after configuring runtime environment:

```bash
scripts/init-hermes-profiles.sh
docker compose --profile runtime up -d --build hermes
```

`scripts/init-hermes-profiles.sh` writes profile directories under `data/hermes/profiles/`. Each generated profile includes:

- `config.yaml` with `memory.provider: honcho` and `mcp_servers.atlas`.
- `skills/atlas-context/SKILL.md` for Atlas custom bridge/data capabilities.
- `atlas-capabilities.json` for deterministic Atlas metadata.
- A profile-local `honcho.json` pointing at the self-hosted Honcho API.

Compose mounts `data/hermes` at `/opt/data`, which is the Hermes data root in the container. Leave `ATLAS_RUNTIME_MODE=stub` unless you intentionally enable the legacy Atlas WhatsApp/chat proxy for local testing.

## Honcho

Honcho is part of the Atlas Compose stack:

- `honcho-api`
- `honcho-deriver`
- `honcho-postgres`
- `honcho-redis`

Atlas reaches Honcho at `http://honcho-api:8000` inside Compose. The host can reach it at `http://127.0.0.1:8000` by default. Honcho source is cloned to `vendor/honcho` because upstream builds from source rather than publishing a stable Docker Hub image.

`LLM_OPENAI_API_KEY`, `LLM_ANTHROPIC_API_KEY`, and `LLM_GEMINI_API_KEY` are optional in Atlas `.env`. Leave them blank when Hermes or the chosen runtime auth provider handles model authentication.

## WhatsApp Public Edge

WhatsApp Cloud API requires a public HTTPS webhook. Atlas publishes Hermes' native WhatsApp Cloud webhook through Tailscale Funnel:

- Public through Funnel: `GET /whatsapp/webhook`, `POST /whatsapp/webhook`.
- Private over Tailscale: everything else.
- Never expose Hermes or PostgreSQL publicly.

Before running the command, enable Funnel in the Tailscale admin console or tailnet policy. Then run:

```bash
scripts/atlasctl webhook
```

The script proxies `https://<node>.<tailnet>.ts.net/whatsapp/webhook` to Hermes' local WhatsApp Cloud listener on `127.0.0.1:${WHATSAPP_CLOUD_WEBHOOK_PORT:-8090}`. Use the printed URL as the Meta WhatsApp webhook callback URL.

## Backups

Back up:

- PostgreSQL volume `postgres-data`.
- Honcho volumes `honcho-postgres-data` and `honcho-redis-data`.
- Hermes data directory `data/hermes/`.
- `.env` secrets in a password manager or encrypted backup.
