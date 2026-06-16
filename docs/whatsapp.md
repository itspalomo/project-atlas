# WhatsApp

Atlas uses WhatsApp Business Cloud API for the production messaging surface.

## Meta App Settings

Configure the webhook callback URL with the Tailscale Funnel URL printed by `scripts/atlasctl webhook`:

```text
https://<your-node>.<tailnet>.ts.net/webhooks/whatsapp
```

Use `WHATSAPP_VERIFY_TOKEN` from `.env` as the webhook verification token.

Required environment variables:

```bash
WHATSAPP_GRAPH_API_VERSION=v24.0
WHATSAPP_PHONE_NUMBER_ID=<phone-number-id>
WHATSAPP_ACCESS_TOKEN=<system-user-token>
WHATSAPP_APP_SECRET=<meta-app-secret>
WHATSAPP_VERIFY_TOKEN=<random-token>
```

## Allowlisting

Allowed senders are defined in `ecosystem/atlas.yaml`:

```yaml
users:
  - id: parent-one
    displayName: Parent One
    identities:
      - channel: whatsapp
        externalId: "+15551234567"
        defaultAgent: household
```

Run this after editing the file:

```bash
scripts/atlasctl seed
```

Shared-agent routing is command-based in v1 and configured per agent:

```text
family: what should we cook this week?
/family plan chores for Saturday
```

Group chat routing is intentionally deferred until the privacy and sender attribution model is explicit.

## Webhook Behavior

- `GET /webhooks/whatsapp` verifies the Meta challenge.
- `POST /webhooks/whatsapp` verifies `X-Hub-Signature-256` when `WHATSAPP_APP_SECRET` is set.
- Text messages from authorized senders are routed to the mapped agent.
- Non-text messages are ignored in v1.
- Unknown senders are audited and ignored by default.

Set `WHATSAPP_SEND_UNAUTHORIZED_REPLY=true` only if you want unknown senders to receive a rejection message.
