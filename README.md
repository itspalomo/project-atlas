# Project Atlas

Project Atlas is a private, self-serve deployment and customization layer for Hermes agent ecosystems. It is designed for families and small trusted groups that want Hermes running on a private VPS over Tailscale, with self-hosted Honcho memory, WhatsApp access, and an iOS bridge for Apple-only data.

Atlas stays intentionally light. Hermes owns messaging, profiles, native skills, MCP discovery, model/provider auth, gateway behavior, and memory-provider execution. Atlas provides installer workflows, identity metadata, configurable Hermes runtime groups, generated profile customizations, structured facts, approvals, audit logs, and the iOS bridge API.

## Documentation

The official docs site is built from [`docs/`](docs/README.md) and published through GitHub Pages:

```text
https://itspalomo.github.io/project-atlas/
```

Start with:

- [Getting Started](docs/getting-started.md)
- [Architecture](docs/architecture.md)
- [Operations](docs/operations.md)
- [Security Model](docs/security.md)

## Quick Install

On a VPS:

```bash
curl -fsSL https://raw.githubusercontent.com/itspalomo/project-atlas/main/scripts/install.sh | sudo bash
```

On macOS, test the clone/config/CLI path without starting services:

```bash
curl -fsSL https://raw.githubusercontent.com/itspalomo/project-atlas/main/scripts/install.sh \
  | ATLAS_DIR="$HOME/project-atlas-test" ATLAS_RUN_INSTALL=false bash
```

After install:

```bash
atlas configure
atlas apply
atlas hermes setup
atlas hermes gateway setup
atlas runtime
atlas webhook
```

## Development

```bash
npm install
npm run build
npm test
```

The repository root contains implementation entry points only; longer operational notes belong in `docs/`.
