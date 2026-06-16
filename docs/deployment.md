# Deployment

Target host:

- Ubuntu 24.04 VPS on Hostinger, DigitalOcean, or similar.
- Docker Compose.
- Tailscale for private administration.
- Optional Cloudflare Tunnel or reverse proxy for the WhatsApp webhook.

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
2. Installs Tailscale on Linux when missing.
3. Rotates placeholder local secrets in `.env`.
4. Starts PostgreSQL.
5. Runs migrations.
6. Seeds the initial users, agents, and WhatsApp allowlist.
7. Starts Atlas API.

## Runtime

Start Hermes after configuring runtime environment:

```bash
scripts/init-hermes-profiles.sh
docker compose --profile runtime up -d --build hermes
```

Set `ATLAS_RUNTIME_MODE=hermes` after the Hermes profile endpoints are reachable.

## WhatsApp Public Edge

WhatsApp Cloud API requires a public HTTPS webhook. Keep the public edge narrow:

- Public: `GET /webhooks/whatsapp`, `POST /webhooks/whatsapp`.
- Private over Tailscale: everything else.
- Never expose Hermes or PostgreSQL publicly.

With Cloudflare Tunnel:

```bash
docker compose --profile public-webhook up -d cloudflared
```

Configure the tunnel route to forward `https://<domain>/webhooks/whatsapp` to `http://atlas-api:3000/webhooks/whatsapp`.

## Backups

Back up:

- PostgreSQL volume `postgres-data`.
- Hermes profile/data volume `hermes-data`.
- Honcho's database and object storage, depending on the chosen Honcho deployment.
- `.env` secrets in a password manager or encrypted backup.
