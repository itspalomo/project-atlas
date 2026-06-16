# Architecture

Project Atlas separates the ecosystem from the agent runtime. The ecosystem is installer-defined through `ecosystem/atlas.yaml`; there are no hard-coded household members or built-in personal agents.

Atlas owns:

- Persistent user and agent identities.
- Channel allowlists and permissions.
- Built-in skill catalog and generated skill manifests.
- Structured facts in PostgreSQL.
- Memory workspace boundaries.
- Approval workflows.
- Integration ingress and egress.
- Audit logs.

Hermes owns:

- The runtime conversation loop.
- Tool execution inside its configured sandbox.
- Agent profile behavior.

Honcho owns:

- Long-term memory inside isolated workspaces.

## Initial Topology

```mermaid
flowchart TD
  CFG["ecosystem/atlas.yaml"] --> API["Atlas API"]
  CFG --> PROF["Generated Hermes profiles"]
  WA["WhatsApp Cloud API"] -->|"signed webhook"| API
  IOS["iOS Bridge"] -->|"private bridge API"| API
  API --> PG["Atlas PostgreSQL"]
  API --> H["Hermes runtime"]
  H --> HC["Self-hosted Honcho API"]
  HC --> HPG["Honcho PostgreSQL + pgvector"]
  HC --> HR["Honcho Redis"]
  PROF --> H
  Admin["Admin over Tailscale"] --> API
  Admin --> H
  Admin --> HC
```

## Routing Rules

- Each allowlisted WhatsApp number maps to the default agent defined for that identity.
- Shared-agent aliases such as `family:` or `/household` are defined in `ecosystem/atlas.yaml`.
- A shared-agent alias only routes if the sender is a member of that agent.
- Unknown WhatsApp senders are rejected and audited.
- Replayed WhatsApp message ids are ignored after the first stored inbound message.

## Structured Data Versus Memory

PostgreSQL is the source of truth for facts:

- Identity records
- Health summaries
- Nutrition intake summaries
- Training plans, planned workouts, performed workouts, exercises, and sets
- Calendar busy blocks
- Reminders
- Goals
- Approvals
- Audit logs

Honcho is the memory layer for conversational and preference memory. Atlas keeps Honcho workspace ids but does not merge workspaces automatically.

## Skills

Skills are configured per agent in `ecosystem/atlas.yaml`. Atlas validates skill ids, stores a manifest in the agent config, appends guidance to generated Hermes `SOUL.md` files, and writes a profile-local `skills.json`.

Skills are not a prompt-only security mechanism. Identity checks, user scoping, memory boundaries, and approvals remain enforced by Atlas API and the iOS bridge.
