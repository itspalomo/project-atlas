# Security Model

## Network

- PostgreSQL binds to `127.0.0.1`.
- Honcho API binds to `127.0.0.1` on the host and stays on the private Compose network internally.
- Hermes binds to `127.0.0.1`.
- Admin access uses Tailscale SSH.
- WhatsApp Cloud API requires a public HTTPS webhook, but only `/webhooks/whatsapp` should be exposed through Tailscale Funnel.

## WhatsApp Identity

- Phone numbers are normalized to digits and stored in `identity_channels`.
- Authorized identities are defined in `ecosystem/atlas.yaml` during install.
- Unknown senders are rejected and logged.
- Meta webhook signatures are verified with `WHATSAPP_APP_SECRET`.
- The verification token is random and stored in `.env`.

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
