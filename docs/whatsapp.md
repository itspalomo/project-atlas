# WhatsApp

Atlas uses Hermes' native WhatsApp gateway for messaging. Atlas does not need to reimplement the WhatsApp webhook path to control who can talk to the agent.

## Recommended Path

For production, use Hermes WhatsApp Business Cloud API:

```bash
atlas apply
atlas runtime
atlas webhook
```

`atlas apply` merges an Atlas-managed allowlist block into `data/hermes/profiles/<profile>/.env` without deleting Hermes-owned credentials. Each profile gets both Hermes allowlists based on that agent's owners, members, and users whose WhatsApp identity defaults to that agent:

```bash
# BEGIN ATLAS MANAGED WHATSAPP ALLOWLIST
WHATSAPP_ALLOWED_USERS=15551234567,15557654321
WHATSAPP_CLOUD_ALLOWED_USERS=15551234567,15557654321
# END ATLAS MANAGED WHATSAPP ALLOWLIST
```

Phone numbers are normalized to country-code digits without `+`, spaces, or dashes. Hermes denies inbound WhatsApp Cloud messages not on the profile's `WHATSAPP_CLOUD_ALLOWED_USERS`.

## Hermes Cloud Credentials

Configure Cloud API credentials with Hermes' own setup wizard for each profile. For a single shared profile, these can also live in the environment passed to the Hermes container:

```bash
WHATSAPP_CLOUD_PHONE_NUMBER_ID=<phone-number-id>
WHATSAPP_CLOUD_ACCESS_TOKEN=<system-user-token>
WHATSAPP_CLOUD_APP_SECRET=<meta-app-secret>
WHATSAPP_CLOUD_VERIFY_TOKEN=<random-token>
WHATSAPP_CLOUD_WEBHOOK_HOST=0.0.0.0
WHATSAPP_CLOUD_WEBHOOK_PORT=8090
WHATSAPP_CLOUD_WEBHOOK_PATH=/whatsapp/webhook
```

For multiple online profiles, keep each profile's WhatsApp credentials in that profile's Hermes `.env`; each Hermes profile/gateway should have its own bot phone number/session or Cloud API credentials. Atlas preserves those credentials and only updates its managed allowlist block.

`atlas webhook` publishes the Hermes webhook through Tailscale Funnel. Use the printed URL as the Meta callback URL:

```text
https://<your-node>.<tailnet>.ts.net/whatsapp/webhook
```

Use `WHATSAPP_CLOUD_VERIFY_TOKEN` as the Meta webhook verification token.

## Allowed Users

Allowed senders are defined once in `ecosystem/atlas.yaml`:

```yaml
users:
  - id: member-one
    displayName: Member One
    identities:
      - channel: whatsapp
        externalId: "+15551234567"
        defaultAgent: household
```

Run `atlas apply` after editing identities. Atlas regenerates each Hermes profile's managed allowlist and reseeds Atlas' structured identity metadata.

## Personal WhatsApp Bridge

For a personal number or quick testing, use Hermes' Baileys bridge instead of Cloud API:

```bash
hermes whatsapp
```

The same generated `WHATSAPP_ALLOWED_USERS` value in the active profile's `.env` applies to Hermes' Baileys bridge. Generated Hermes `config.yaml` sets unauthorized WhatsApp DMs to `ignore` for private installs.
