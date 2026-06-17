# Security Model

## Network

- PostgreSQL binds to `127.0.0.1`.
- Honcho API binds to `127.0.0.1` on the host and stays on the private Compose network internally.
- Hermes dashboard, gateway API, and WhatsApp Cloud webhook bind to `127.0.0.1` on the host.
- Atlas MCP and bridge APIs stay on the private Compose/Tailscale network.
- Admin access uses Tailscale SSH.
- WhatsApp Cloud API requires a public HTTPS webhook, but only Hermes' `/whatsapp/webhook` path should be exposed through Tailscale Funnel.

## WhatsApp Messaging

- Hermes owns WhatsApp credentials, sender authorization, webhook verification, signature checks, and channel behavior.
- Atlas does not collect WhatsApp numbers during onboarding and does not write channel authorization environment variables.
- `atlas webhook` only publishes Hermes' configured `/whatsapp/webhook` listener through Tailscale Funnel.
- The Hermes verification token and Meta app secret stay in Hermes-owned environment or profile configuration.

## iOS Bridge

- The bootstrap bearer token is for setup only.
- Devices register through the bridge API and receive a device-specific token once.
- Device-specific tokens are scoped to the paired `userId`.
- Device token hashes are stored in `bridge_devices`; raw tokens are not stored.
- Health data is summarized before leaving the phone.
- Calendar sync defaults to busy blocks only.
- Location sync stores semantic places, not coordinates.

## Runtime

- Atlas API does not mount the Docker socket.
- Atlas API runs as a non-root user in the container.
- Atlas API runs with a read-only root filesystem and `no-new-privileges`.
- Atlas MCP requires `ATLAS_MCP_KEY` in production and only exposes explicit custom tools.
- Hermes should not receive unrestricted host filesystem access.
- Hermes owns native skills, MCP discovery, messaging gateways, channel authorization, and memory-provider access. Atlas capability metadata only describes custom structured-data and bridge surfaces.

## Approvals

Sensitive actions require an approval record before execution:

- Calendar event creation.
- Reminder creation.
- Goal changes.
- Schedule modifications.
- Family planning commitments.

Non-sensitive actions may run without approval:

- Summaries.
- Coaching.
- Recommendations.
- Analysis.
