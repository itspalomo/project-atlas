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

Configure Hermes first for the profile or runtime group you want online:

```bash
atlas apply
atlas hermes setup
atlas hermes gateway setup
```

For Hermes' personal WhatsApp bridge, Hermes also documents the direct WhatsApp wizard:

```bash
atlas hermes whatsapp
```

Then start or restart the runtime and publish only the Hermes webhook path when the selected Hermes channel needs a public callback:

```bash
atlas runtime
atlas webhook
```

`atlas webhook` uses Tailscale Funnel to proxy:

```text
https://<your-node>.<tailnet>.ts.net/whatsapp/webhook
```

to the local Hermes webhook listener. Use that URL as the provider callback URL when Hermes asks for one. Any verification token or channel secret is configured in Hermes.

## Credentials

Keep Hermes credentials in Hermes' own profile/runtime configuration. Atlas does not store Meta credentials, WhatsApp sender policy, or model provider auth in `.env`.

For multiple isolated runtime groups, run Hermes setup against the intended generated service/profile:

```bash
atlas hermes --service hermes-shared-household -p household setup
atlas hermes --service hermes-shared-household -p household gateway setup
```

Each Hermes gateway should use its own intended channel credentials and authorization policy.

## What Atlas Generates

`atlas apply` generates Hermes profile support files:

- `config.yaml` entries for Honcho memory and the Atlas MCP endpoint.
- `skills/atlas-context/SKILL.md` for Atlas bridge and deterministic context behavior.
- `atlas-capabilities.json` for local debugging.
- `honcho.json` for self-hosted Honcho memory provider wiring.
- `data/hermes/compose.runtime.yaml` for the configured runtime groups.

If an older install has an Atlas-managed WhatsApp allowlist block in a generated profile `.env`, `atlas apply` removes that legacy block and leaves other Hermes-owned credentials intact.

## Personal Bridge

For a personal WhatsApp session or local testing, use Hermes' own command flow through the Atlas wrapper:

```bash
atlas hermes whatsapp
```

Atlas still does not manage the sender policy for that bridge.
