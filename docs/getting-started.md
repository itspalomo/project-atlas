# Getting Started

This path assumes a fresh VPS or a Mac test install. Atlas installs the control plane and generates Hermes profile customizations; Hermes still owns provider auth, WhatsApp credentials, profile behavior, and memory-provider execution.

## Install On A VPS

Connect over SSH, then run:

```bash
curl -fsSL https://raw.githubusercontent.com/itspalomo/project-atlas/main/scripts/install.sh | sudo bash
```

The installer is idempotent. Reruns reuse an existing checkout, preserve `.env`, skip Tailscale setup when already connected, keep existing Honcho source unless configured otherwise, and converge database/profile state from `ecosystem/atlas.yaml`.

## Test On A Mac

To test clone, config, and CLI install without starting services:

```bash
curl -fsSL https://raw.githubusercontent.com/itspalomo/project-atlas/main/scripts/install.sh \
  | ATLAS_DIR="$HOME/project-atlas-test" ATLAS_RUN_INSTALL=false bash
```

For a local checkout:

```bash
cp .env.example .env
scripts/atlasctl install
```

## First Configuration

Run:

```bash
atlas configure
```

The onboarding questionnaire creates `ecosystem/atlas.yaml`.

It asks for:

| Prompt | Meaning |
| --- | --- |
| Install label | Friendly name for admin output and generated metadata. Not a product name, auth setting, or persona. |
| People | Local users for bridge scoping, approvals, and agent membership. Messaging users are configured in Hermes. |
| Agents | Hermes profiles. A profile can be personal or shared. |
| Runtime group | The Hermes container boundary. Use `default` for one container, or add named runtime groups for isolated containers. |
| Hermes profile name | The profile directory/name Hermes uses. |
| Honcho workspace | The memory workspace for that profile. Reuse only when you intentionally want shared memory. |
| Atlas capabilities | Custom Atlas data surfaces exposed through one generated Hermes skill and MCP. |

## Apply Changes

After editing `.env` or `ecosystem/atlas.yaml`:

```bash
atlas apply
```

This runs migrations, seeds local users, agents, memberships, and optional identity metadata, generates or updates Atlas-managed Hermes profile files, and restarts Atlas API.

## Start Hermes

Run Hermes' own setup after Atlas has generated the profiles:

```bash
atlas hermes setup
atlas hermes gateway setup
```

Then start or restart the runtime:

```bash
atlas runtime
```

For WhatsApp Cloud, publish only Hermes' webhook path through Tailscale Funnel:

```bash
atlas webhook
```

## Health Checks

```bash
atlas status
atlas doctor
atlas logs atlas-api
```

The API exposes:

- `GET /health`: process is alive.
- `GET /ready`: PostgreSQL is reachable.
