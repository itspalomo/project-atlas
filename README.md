# Project Atlas

Project Atlas is a private personal-agent ecosystem for individuals and families. Atlas owns identity, permissions, structured facts, approvals, integrations, and memory boundaries. Hermes is the initial runtime, but the runtime is treated as replaceable.

This baseline starts with three persistent identities:

- `atlas-jose`: Jose's personal agent, private `jose` Honcho workspace.
- `atlas-wife`: Wife's personal agent, private `wife` Honcho workspace.
- `atlas-family`: shared household agent, explicit-share-only `family` Honcho workspace.

## What Is Included

- Docker Compose for Atlas API, PostgreSQL, Hermes, and optional Cloudflare webhook tunnel.
- PostgreSQL schema for identities, agents, allowlisted channels, approvals, audit logs, health summaries, calendar availability, reminders, and goals.
- WhatsApp Business Cloud API webhook scaffold with signature verification and sender allowlisting.
- iOS bridge API scaffold for privacy-preserving HealthKit, calendar availability, semantic location, reminders, and approvals.
- Hermes profile assets and setup script for the three Atlas agents.
- Honcho self-hosting bootstrap script and memory isolation docs.
- VPS installer script for Ubuntu 24.04 style hosts.

## Quick Start

```bash
cp .env.example .env
$EDITOR .env
scripts/install.sh
```

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

## Security Defaults

- Hermes dashboard/API ports bind to localhost by default.
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
