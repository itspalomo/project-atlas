# Architecture

Atlas separates the installer's deterministic control plane from Hermes' runtime. The system is intentionally small: Atlas defines users, profile membership, bridge permissions, deterministic facts, approvals, and generated config; Hermes owns conversation execution.

## Ownership Boundaries

```mermaid
flowchart TB
  subgraph Edge["Public edge"]
    WA["WhatsApp Cloud API"]
    Funnel["Tailscale Funnel\n/whatsapp/webhook only"]
  end

  subgraph Tailnet["Private VPS and tailnet"]
    Admin["Admin over SSH/Tailscale"]
    AtlasCLI["atlas CLI"]
    API["Atlas API\nbridge + MCP + approvals"]
    PG["Atlas PostgreSQL\nstructured facts"]
    Hermes["Hermes runtime\nprofiles + gateways"]
    Honcho["Honcho API\nlong-term memory"]
    HPG["Honcho PostgreSQL + pgvector"]
    HRedis["Honcho Redis"]
  end

  subgraph Devices["User devices"]
    IOS["iOS bridge app\nHealthKit, calendar, reminders, semantic location"]
    User["Approved WhatsApp users"]
  end

  WA --> Funnel --> Hermes
  User --> WA
  Admin --> AtlasCLI
  AtlasCLI --> API
  AtlasCLI --> Hermes
  IOS -->|"device token + scoped writes"| API
  Hermes -->|"Atlas MCP context + approvals"| API
  API --> PG
  Hermes -->|"native Honcho provider"| Honcho
  Honcho --> HPG
  Honcho --> HRedis

  classDef edge fill:#fff4cf,stroke:#d9a441,color:#1e1a0c,stroke-width:2px;
  classDef private fill:#e8f0ec,stroke:#1f6f68,color:#10201d,stroke-width:2px;
  classDef data fill:#eef2f7,stroke:#365f82,color:#101d2a,stroke-width:2px;
  classDef device fill:#f5e8e4,stroke:#9f513f,color:#24120e,stroke-width:2px;
  class WA,Funnel edge;
  class Admin,AtlasCLI,API,Hermes,Honcho private;
  class PG,HPG,HRedis data;
  class IOS,User device;
```

<div class="diagram-key">
<span>Gold: public WhatsApp edge</span>
<span>Green: private runtime/control plane</span>
<span>Blue: durable data stores</span>
<span>Clay: user-owned devices</span>
</div>

## Runtime Ownership

| Component | Owns | Does Not Own |
| --- | --- | --- |
| Hermes | Messaging, profiles, gateway allowlists, native skills, MCP discovery, model/provider auth, memory-provider execution | Atlas bridge storage, approval records, deterministic fact schema |
| Atlas | Installer, identity metadata, generated profile config, bridge API, MCP context endpoint, approvals, audit logs | Chat proxying, LLM calls, persona management, raw HealthKit/calendar/location data |
| Honcho | Long-term conversational memory inside configured workspaces | Structured facts, access policy, bridge device pairing |
| iOS bridge | Local Apple data access and local Apple writes | Agent runtime behavior |

## Profile And Memory Topology

One Hermes container with many profiles is the default. Use separate containers only for hard isolation requirements such as resource limits, network segmentation, image pinning, or compliance boundaries.

```mermaid
flowchart LR
  subgraph Config["ecosystem/atlas.yaml"]
    U1["user: jose\nwhatsapp: +1..."]
    U2["user: spouse\nwhatsapp: +1..."]
    A1["agent: jose\nprofile: jose\nworkspace: jose"]
    A2["agent: spouse\nprofile: spouse\nworkspace: spouse"]
    A3["agent: family\nprofile: family\nworkspace: family"]
  end

  subgraph HermesBox["one Hermes container"]
    P1["profile jose\npersonal gateway"]
    P2["profile spouse\npersonal gateway"]
    P3["profile family\nshared gateway"]
  end

  subgraph Memory["Honcho workspaces"]
    M1["workspace jose"]
    M2["workspace spouse"]
    M3["workspace family"]
  end

  U1 --> A1 --> P1 --> M1
  U2 --> A2 --> P2 --> M2
  U1 --> A3
  U2 --> A3
  A3 --> P3 --> M3

  classDef config fill:#fffdf7,stroke:#d7c9aa,color:#14201d,stroke-width:2px;
  classDef hermes fill:#fff4cf,stroke:#d9a441,color:#241b0a,stroke-width:2px;
  classDef memory fill:#eef2f7,stroke:#365f82,color:#101d2a,stroke-width:2px;
  class U1,U2,A1,A2,A3 config;
  class P1,P2,P3 hermes;
  class M1,M2,M3 memory;
```

Profiles have separate memory by default because Atlas generates separate Honcho workspace names. If two profiles should intentionally share memory, set the same `honchoWorkspace` in `ecosystem/atlas.yaml`.

## Message And Context Flow

```mermaid
sequenceDiagram
  autonumber
  participant User as Authorized user
  participant WA as WhatsApp Cloud
  participant H as Hermes profile gateway
  participant MCP as Atlas MCP endpoint
  participant DB as Atlas PostgreSQL
  participant HC as Honcho

  User->>WA: Send message
  WA->>H: Signed webhook delivery
  H->>H: Verify sender allowlist
  H->>HC: Read/write native memory
  H->>MCP: Request Atlas deterministic context when needed
  MCP->>DB: Read scoped facts and approvals
  DB-->>MCP: Context snapshot
  MCP-->>H: Scoped facts
  H-->>WA: Response
  WA-->>User: Delivered reply
```

Hermes rejects unknown WhatsApp senders before the agent loop. Atlas still stores identity records because the bridge, approvals, audit logs, and scoped context need deterministic user/profile relationships.

## iOS Bridge Flow

```mermaid
sequenceDiagram
  autonumber
  participant App as iOS bridge
  participant User as User
  participant Atlas as Atlas API
  participant DB as PostgreSQL
  participant Hermes as Hermes

  App->>User: Ask for HealthKit/EventKit/Reminders permissions
  User-->>App: Grants selected scopes
  App->>Atlas: Register device with bootstrap token
  Atlas-->>App: Device id + one-time token
  App->>Atlas: Send summaries, busy blocks, semantic location, approvals
  Atlas->>DB: Upsert scoped structured facts
  Hermes->>Atlas: Read context through Atlas MCP
  Atlas-->>Hermes: Only authorized summaries and deterministic facts
```

The bridge sends summaries and availability windows, not raw health samples, full calendar bodies, or raw location history by default.

## Data Boundary

```mermaid
flowchart TD
  Memory["Honcho memory\npreferences, observations, conversational memory"]
  Facts["PostgreSQL facts\nidentity, health summaries, training, nutrition, busy blocks, approvals"]
  Bridge["iOS bridge\nlocal Apple data boundary"]
  Hermes["Hermes\nreasoning + tools"]
  User["User consent"]

  User --> Bridge
  Bridge -->|"summaries + approved writes"| Facts
  Hermes -->|"native provider"| Memory
  Hermes -->|"MCP queries"| Facts
  Facts -->|"scoped snapshots"| Hermes

  classDef memory fill:#eef2f7,stroke:#365f82,color:#101d2a,stroke-width:2px;
  classDef facts fill:#e8f0ec,stroke:#1f6f68,color:#10201d,stroke-width:2px;
  classDef bridge fill:#f5e8e4,stroke:#9f513f,color:#24120e,stroke-width:2px;
  class Memory memory;
  class Facts,Hermes facts;
  class Bridge,User bridge;
```
