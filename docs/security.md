# Security Model

## Network

- PostgreSQL binds to `127.0.0.1`.
- Honcho API binds to `127.0.0.1` on the host and stays on the private Compose network internally.
- Hermes dashboard, gateway API, and WhatsApp Cloud webhook bind to `127.0.0.1` on the host.
- Admin access uses Tailscale SSH.
- WhatsApp Cloud API requires a public HTTPS webhook, but only Hermes' `/whatsapp/webhook` path should be exposed through Tailscale Funnel.

## WhatsApp Identity

- Phone numbers are normalized to digits from `ecosystem/atlas.yaml`.
- `atlas apply` writes those numbers to Hermes' managed `data/hermes/atlas.env` allowlists.
- Hermes rejects unknown WhatsApp Cloud senders through `WHATSAPP_CLOUD_ALLOWED_USERS`.
- Meta webhook signatures are verified by Hermes with `WHATSAPP_CLOUD_APP_SECRET`.
- The Hermes verification token is random and stored in `.env` as `WHATSAPP_CLOUD_VERIFY_TOKEN`.

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
- Hermes should not receive unrestricted host filesystem access.
- Agent skills are data capability manifests, not authorization or persona guidance. Atlas still enforces structured-data scope and approvals; Hermes enforces gateway allowlists and memory-provider access.

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
