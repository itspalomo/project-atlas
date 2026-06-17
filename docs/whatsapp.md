# WhatsApp

Atlas uses Hermes' native WhatsApp gateway for messaging. Atlas does not need to reimplement the WhatsApp webhook path to control who can talk to the agent.

## Recommended Path

For production, use Hermes WhatsApp Business Cloud API:

```bash
atlas apply
atlas runtime
atlas webhook
```

`atlas apply` generates `data/hermes/atlas.env` from `ecosystem/atlas.yaml`. That file sets both Hermes allowlists:

```bash
WHATSAPP_ALLOWED_USERS=15551234567,15557654321
WHATSAPP_CLOUD_ALLOWED_USERS=15551234567,15557654321
```

Phone numbers are normalized to country-code digits without `+`, spaces, or dashes. Hermes denies inbound WhatsApp Cloud messages not on `WHATSAPP_CLOUD_ALLOWED_USERS`.

## Hermes Cloud Credentials

Configure the Cloud API credentials in `.env` or with Hermes' own setup wizard:

```bash
WHATSAPP_CLOUD_PHONE_NUMBER_ID=<phone-number-id>
WHATSAPP_CLOUD_ACCESS_TOKEN=<system-user-token>
WHATSAPP_CLOUD_APP_SECRET=<meta-app-secret>
WHATSAPP_CLOUD_VERIFY_TOKEN=<random-token>
WHATSAPP_CLOUD_WEBHOOK_HOST=0.0.0.0
WHATSAPP_CLOUD_WEBHOOK_PORT=8090
WHATSAPP_CLOUD_WEBHOOK_PATH=/whatsapp/webhook
```

`atlas webhook` publishes the Hermes webhook through Tailscale Funnel. Use the printed URL as the Meta callback URL:

```text
https://<your-node>.<tailnet>.ts.net/whatsapp/webhook
```

Use `WHATSAPP_CLOUD_VERIFY_TOKEN` as the Meta webhook verification token.

## Allowed Users

Allowed senders are defined once in `ecosystem/atlas.yaml`:

```yaml
users:
  - id: parent-one
    displayName: Parent One
    identities:
      - channel: whatsapp
        externalId: "+15551234567"
        defaultAgent: household
```

Run `atlas apply` after editing identities. Atlas regenerates Hermes' managed allowlist file and reseeds Atlas' structured identity tables.

## Personal WhatsApp Bridge

For a personal number or quick testing, use Hermes' Baileys bridge instead of Cloud API:

```bash
hermes whatsapp
```

The same generated `WHATSAPP_ALLOWED_USERS` value in `data/hermes/atlas.env` applies to Hermes' Baileys bridge. Generated Hermes `config.yaml` sets unauthorized WhatsApp DMs to `ignore` for private installs.
