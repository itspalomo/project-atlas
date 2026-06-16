# Deployment

Target host:

- Ubuntu 24.04 VPS on Hostinger, DigitalOcean, or similar.
- Docker Compose.
- Tailscale for private administration.
- Tailscale Funnel for the public WhatsApp webhook.
- A supported Honcho LLM provider key in `.env`.

## One-Command Bootstrap

On the VPS:

```bash
git clone git@github.com:itspalomo/project-atlas.git
cd project-atlas
cp .env.example .env
$EDITOR .env
scripts/install.sh
```

The installer:

1. Installs Docker on Linux when missing.
2. Checks Tailscale, skips setup when already connected, or installs/authenticates when needed.
3. Creates `ecosystem/atlas.yaml` if missing.
4. Rotates placeholder local secrets in `.env`.
5. Clones upstream Honcho into `vendor/honcho`.
6. Starts Atlas PostgreSQL and self-hosted Honcho.
7. Runs migrations.
8. Seeds users, agents, channel allowlists, and membership from `ecosystem/atlas.yaml`.
9. Generates Hermes profile assets and Honcho configs.
10. Starts Atlas API.

## Ecosystem Config

The local ecosystem file controls identity and routing:

```yaml
users:
  - id: parent-one
    displayName: Parent One
    identities:
      - channel: whatsapp
        externalId: "+15551234567"
        defaultAgent: household

agents:
  - id: household
    displayName: Household Atlas
    type: shared
    honchoWorkspace: household
    members:
      - parent-one
    routing:
      defaultFor:
        - parent-one
      aliases:
        - "family:"
        - "/family"
```

## Runtime

Start Hermes after configuring runtime environment:

```bash
scripts/init-hermes-profiles.sh
docker compose --profile runtime up -d --build hermes
```

Set `ATLAS_RUNTIME_MODE=hermes` after the Hermes profile endpoints are reachable.

## Honcho

Honcho is part of the Atlas Compose stack:

- `honcho-api`
- `honcho-deriver`
- `honcho-postgres`
- `honcho-redis`

Atlas reaches Honcho at `http://honcho-api:8000` inside Compose. The host can reach it at `http://127.0.0.1:8000` by default. Honcho source is cloned to `vendor/honcho` because upstream builds from source rather than publishing a stable Docker Hub image.

## WhatsApp Public Edge

WhatsApp Cloud API requires a public HTTPS webhook. Atlas publishes that webhook through Tailscale Funnel:

- Public through Funnel: `GET /webhooks/whatsapp`, `POST /webhooks/whatsapp`.
- Private over Tailscale: everything else.
- Never expose Hermes or PostgreSQL publicly.

Before running the command, enable Funnel in the Tailscale admin console or tailnet policy. Then run:

```bash
scripts/atlasctl webhook
```

The script proxies `https://<node>.<tailnet>.ts.net/webhooks/whatsapp` to the local Atlas API on `127.0.0.1:${ATLAS_API_PORT:-3000}`. Use the printed URL as the Meta WhatsApp webhook callback URL.

## Backups

Back up:

- PostgreSQL volume `postgres-data`.
- Honcho volumes `honcho-postgres-data` and `honcho-redis-data`.
- Hermes profile/data volume `hermes-data`.
- `.env` secrets in a password manager or encrypted backup.
