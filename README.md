# Project Atlas

Project Atlas is a private personal-agent ecosystem for individuals and families. Atlas owns identity, permissions, structured facts, approvals, integrations, and memory boundaries. Hermes is the initial runtime, but the runtime is treated as replaceable.

Atlas is self-serve. A local `ecosystem/atlas.yaml` file defines the users, their WhatsApp identities, shared or personal agents, routing aliases, Hermes profiles, and Honcho memory workspaces for each installation. The repository does not ship with named built-in people.

## What Is Included

- Docker Compose for Atlas API, PostgreSQL, self-hosted Honcho, and Hermes.
- Tailscale Funnel setup for the public WhatsApp webhook edge.
- PostgreSQL schema for identities, agents, allowlisted channels, approvals, audit logs, health summaries, nutrition intake, calendar availability, reminders, and goals.
- WhatsApp Business Cloud API webhook scaffold with signature verification and sender allowlisting.
- iOS bridge API scaffold for privacy-preserving HealthKit, calendar availability, semantic location, reminders, and approvals.
- Lightweight nutrition intake bridge for calories, macros, fiber, hydration, and source confidence.
- Self-serve ecosystem config generator.
- Hermes profile and Honcho config generation from the local ecosystem config.
- Honcho self-hosting bootstrap wired into the default installer.
- VPS installer script for Ubuntu 24.04 style hosts.

## Quick Start

```bash
cp .env.example .env
$EDITOR .env
scripts/install.sh
```

The installer creates `ecosystem/atlas.yaml` if it does not exist. Edit that file to define the number of users, allowed WhatsApp identities, and shared agents for the installation.

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
- WhatsApp webhook requests require Meta signature verification when `WHATSAPP_APP_SECRET` is set.
- Only phone numbers seeded into `identity_channels` can route messages to agents.
- iOS bridge writes structured summaries and availability windows, not raw health samples, raw calendar event details, or raw location history.
- Sensitive actions are modeled as approvals before execution.

## Docs

- [Architecture](docs/architecture.md)
- [Deployment](docs/deployment.md)
- [Security Model](docs/security.md)
- [Memory Isolation](docs/memory-isolation.md)
- [WhatsApp](docs/whatsapp.md)
- [iOS Bridge](docs/ios-bridge.md)
- [Nutrition Model](docs/nutrition-model.md)
