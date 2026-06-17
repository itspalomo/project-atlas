# Project Atlas

Project Atlas is a private personal-agent ecosystem installer and customization layer for individuals and families. Hermes owns the agent runtime: messaging, profiles, native skills, MCP tools, model/provider auth, and memory providers. Atlas generates Hermes config and provides custom structured-data, iOS bridge, approval, and deployment surfaces.

Atlas is self-serve. A local `ecosystem/atlas.yaml` file defines the users, their WhatsApp identities, shared or personal agents, routing aliases, Hermes profiles, and Honcho memory workspaces for each installation. The repository does not ship with named built-in people.

## What Is Included

- Docker Compose for Atlas API, PostgreSQL, self-hosted Honcho, and Hermes.
- Tailscale Funnel setup for the public Hermes WhatsApp webhook edge.
- PostgreSQL schema for identity metadata, agents, approvals, audit logs, health summaries, nutrition intake, calendar availability, reminders, and goals.
- Hermes WhatsApp gateway allowlist generation from the local ecosystem config.
- iOS bridge API scaffold for privacy-preserving HealthKit, calendar availability, semantic location, reminders, and approvals.
- Internal Atlas MCP endpoint for Hermes-native access to custom structured context.
- Lightweight nutrition intake bridge for calories, macros, fiber, hydration, and source confidence.
- Deterministic training tables for plans, planned workouts, performed workouts, exercises, and sets.
- Atlas capability catalog that generates a native Hermes `atlas-context` skill for custom bridge/data behavior.
- Self-serve ecosystem config generator.
- Hermes profile config generation, including native Honcho memory-provider, MCP, gateway allowlist, and skill files from the local ecosystem config.
- Honcho self-hosting setup wired into the default installer.
- `atlas` CLI wrapper for install, configure, apply, status, logs, runtime, webhook, and updates.
- Cross-platform installer script for macOS and Linux VPS hosts.

## Quick Start

Once this repository is public or otherwise reachable from the host:

```bash
curl -fsSL https://raw.githubusercontent.com/itspalomo/project-atlas/main/scripts/install.sh | bash
```

On Linux VPS hosts, run that through `sudo bash` when installing to the default `/opt/project-atlas`.

Then use the installed CLI:

```bash
atlas status
atlas configure
atlas apply
atlas webhook
atlas runtime
```

For a local checkout:

```bash
cp .env.example .env
$EDITOR .env
scripts/atlasctl install
```

The installer creates `ecosystem/atlas.yaml` if it does not exist. Edit that file to define the number of users, allowed WhatsApp identities, and shared agents for the installation, then run `atlas apply` or `scripts/atlasctl apply`.

For local development:

```bash
npm install
npm run build
npm test
docker compose up -d --build postgres
npm run migrate --workspace @project-atlas/atlas-api
npm run seed --workspace @project-atlas/atlas-api
npm run dev --workspace @project-atlas/atlas-api
```

Runtime checks:

- `GET /health` confirms the API process is alive.
- `GET /ready` confirms the API can reach PostgreSQL.

## Security Defaults

- Hermes dashboard/API ports bind to localhost by default.
- Honcho API binds to localhost on the host and is reachable inside Compose as `http://honcho-api:8000`.
- Hermes WhatsApp Cloud webhook requests require Meta signature verification when `WHATSAPP_CLOUD_APP_SECRET` is set.
- Only phone numbers generated into Hermes' WhatsApp gateway allowlists can reach the agent loop.
- iOS bridge writes structured summaries and availability windows, not raw health samples, raw calendar event details, or raw location history.
- Sensitive actions are modeled as approvals before execution.

## Docs

- [Architecture](docs/architecture.md)
- [CLI](docs/cli.md)
- [Deployment](docs/deployment.md)
- [Security Model](docs/security.md)
- [Memory Isolation](docs/memory-isolation.md)
- [Skills](docs/skills.md)
- [WhatsApp](docs/whatsapp.md)
- [iOS Bridge](docs/ios-bridge.md)
- [Nutrition Model](docs/nutrition-model.md)
- [Training Model](docs/training-model.md)
