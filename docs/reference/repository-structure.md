# Repository Structure

Atlas keeps implementation notes in the documentation site instead of scattering long README files across every folder.

```text
.
├── apps/atlas-api/              TypeScript API, MCP endpoint, bridge routes, db tools
├── docs/                        GitHub Pages documentation site
├── ecosystem/                   Example self-serve ecosystem config
├── infrastructure/
│   └── postgres/migrations/     Atlas schema migrations
├── scripts/                     Installer, atlas CLI, Tailscale, Honcho, profile generation
├── compose.yaml                 Deployment entry point
└── .env.example                 Deployment settings template
```

## Important Entry Points

| Path | Purpose |
| --- | --- |
| `scripts/install.sh` | Cross-platform installer. Supports `curl | bash` and local checkout mode. |
| `scripts/atlasctl` | Installed as the `atlas` CLI. |
| `scripts/init-ecosystem.sh` | Interactive ecosystem config generator. |
| `scripts/init-hermes-profiles.sh` | Generates or merges Atlas-managed Hermes profile files. |
| `apps/atlas-api/src/bridge/routes.ts` | iOS bridge API routes. |
| `apps/atlas-api/src/mcp/routes.ts` | Atlas MCP endpoint for Hermes custom context. |
| `apps/atlas-api/src/tools/generateHermesProfiles.ts` | Hermes profile customization generator. |
| `infrastructure/postgres/migrations/` | Structured fact schema. |

## Removed README Sprawl

Implementation folders stay code-first. Operational details live in these docs:

- Bridge details: [iOS Bridge](../ios-bridge.md) and [Bridge API](bridge-api.md).
- Runtime details: [Architecture](../architecture.md) and [Operations](../operations.md).
- Data details: [Data Model](../data-model.md), [Training Model](../training-model.md), and [Nutrition Model](../nutrition-model.md).
- Security details: [Security Model](../security.md).
