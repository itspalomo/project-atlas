# WhatsApp

Atlas uses WhatsApp Business Cloud API for the production messaging surface.

## Meta App Settings

Configure the webhook callback URL:

```text
https://<your-domain>/webhooks/whatsapp
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

Set these before running `scripts/install.sh` or rerun `scripts/atlasctl seed` after changing them:

```bash
ATLAS_JOSE_WHATSAPP_E164=+15551234567
ATLAS_WIFE_WHATSAPP_E164=+15557654321
```

The seed script creates `identity_channels` rows:

- Jose number -> `atlas-jose`
- Wife number -> `atlas-wife`

Family routing is command-based in v1:

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
