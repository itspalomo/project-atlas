# WhatsApp

Atlas uses Hermes' native WhatsApp support. Atlas does not collect phone numbers during onboarding, does not decide who may message an agent, and does not write Hermes WhatsApp allowlist environment variables.

## Ownership

| Concern | Owner |
| --- | --- |
| WhatsApp Cloud credentials | Hermes |
| WhatsApp sender authorization | Hermes |
| Webhook verification and signatures | Hermes |
| Agent/profile channel behavior | Hermes |
| Tailscale Funnel publication of the Hermes webhook path | Atlas script |
| Bridge devices, local users, approvals, and deterministic context | Atlas |

`ecosystem/atlas.yaml` models people, agents, runtime groups, Honcho workspaces, and Atlas bridge capabilities. Configure sender identities, Meta credentials, sender policy, and client behavior with Hermes.

## Production Path

For WhatsApp Business Cloud API, configure Hermes first for the profile or runtime group you want online. Then start the runtime and publish only the Hermes webhook path:

```bash
atlas apply
atlas runtime
atlas webhook
```

`atlas webhook` uses Tailscale Funnel to proxy:

```text
https://<your-node>.<tailnet>.ts.net/whatsapp/webhook
```

to the local Hermes webhook listener. Use that URL as the Meta callback URL. Use the verification token configured in Hermes as the Meta webhook verification token.

## Credentials

For simple single-runtime installs, `.env` includes optional passthrough variables that Docker Compose can provide to Hermes:

```bash
WHATSAPP_CLOUD_PHONE_NUMBER_ID=<phone-number-id>
WHATSAPP_CLOUD_ACCESS_TOKEN=<system-user-token>
WHATSAPP_CLOUD_APP_SECRET=<meta-app-secret>
WHATSAPP_CLOUD_VERIFY_TOKEN=<random-token>
WHATSAPP_CLOUD_WEBHOOK_HOST=0.0.0.0
WHATSAPP_CLOUD_WEBHOOK_PORT=8090
WHATSAPP_CLOUD_WEBHOOK_PATH=/whatsapp/webhook
```

For multiple isolated runtime groups, prefer profile-local or runtime-local Hermes credentials. Each Hermes gateway should use its own intended channel credentials and authorization policy.

## What Atlas Generates

`atlas apply` generates Hermes profile support files:

- `config.yaml` entries for Honcho memory and the Atlas MCP endpoint.
- `skills/atlas-context/SKILL.md` for Atlas bridge and deterministic context behavior.
- `atlas-capabilities.json` for local debugging.
- `honcho.json` for self-hosted Honcho memory provider wiring.
- `data/hermes/compose.runtime.yaml` for the configured runtime groups.

If an older install has an Atlas-managed WhatsApp allowlist block in a generated profile `.env`, `atlas apply` removes that legacy block and leaves other Hermes-owned credentials intact.

## Personal Bridge

For a personal WhatsApp session or local testing, use Hermes' own command flow, for example:

```bash
hermes whatsapp
```

Atlas still does not manage the sender policy for that bridge.
