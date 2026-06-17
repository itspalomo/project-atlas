# Project Atlas Documentation

Project Atlas is a private deployment and customization layer around Hermes. It helps a family or trusted group define who exists, which Hermes profiles exist, which people can use each profile, which Honcho workspace each profile uses, and which custom bridge/data surfaces are available.

Hermes stays the agent runtime. Atlas should not become a chat proxy, model router, persona framework, or memory engine.

<div class="atlas-grid">

**Hermes native first**
Messaging, profiles, gateway auth, native skills, MCP discovery, model/provider auth, and memory-provider behavior belong to Hermes.

**Atlas fills gaps**
Atlas provides installer workflows, identity metadata, iOS bridge APIs, structured facts, approvals, and generated Hermes profile customizations.

**Private by default**
Administrative surfaces stay on the VPS or Tailscale. Only Hermes' signed WhatsApp webhook path is published through Tailscale Funnel.

</div>

## What Atlas Builds

```mermaid
flowchart LR
  Installer["One-command installer"] --> Config["ecosystem/atlas.yaml"]
  Config --> Profiles["Hermes profiles"]
  Config --> Identity["Identity metadata"]
  Config --> Workspaces["Honcho workspaces"]
  Profiles --> Hermes["Hermes runtime"]
  Identity --> Bridge["iOS bridge scopes"]
  Workspaces --> Honcho["Self-hosted Honcho"]
  Bridge --> AtlasAPI["Atlas API"]
  Hermes --> AtlasAPI

  classDef atlas fill:#e8f0ec,stroke:#1f6f68,color:#10201d,stroke-width:2px;
  classDef hermes fill:#fff4cf,stroke:#d9a441,color:#241b0a,stroke-width:2px;
  classDef data fill:#eef2f7,stroke:#365f82,color:#101d2a,stroke-width:2px;
  class Installer,Config,Identity,Bridge,AtlasAPI atlas;
  class Profiles,Hermes hermes;
  class Workspaces,Honcho data;
```

## Main Paths

| Path | Start Here |
| --- | --- |
| Install on a VPS | [Getting Started](getting-started.md) |
| Understand the system | [Architecture](architecture.md) |
| Operate services | [Operations](operations.md) |
| Configure WhatsApp | [WhatsApp](whatsapp.md) |
| Build the iOS bridge | [iOS Bridge](ios-bridge.md) |
| Review data boundaries | [Security Model](security.md) |

## Repository Shape

The repo keeps product documentation in `docs/` and implementation files in focused folders:

```text
apps/atlas-api/          Atlas API, bridge routes, MCP endpoint, seed/migrate tools
ecosystem/               Example self-serve ecosystem configuration
infrastructure/          Database migrations and host-specific infrastructure assets
scripts/                 Installer, CLI wrapper, Tailscale, Honcho, profile generation
docs/                    GitHub Pages documentation site
```

See [Repository Structure](reference/repository-structure.md) for the full map.
