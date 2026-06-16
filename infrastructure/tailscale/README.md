# Tailscale

Atlas uses Tailscale for private administration and future private app-to-server traffic.

Recommended host setup:

```bash
sudo tailscale up --ssh --hostname project-atlas
```

For non-interactive VPS bootstrap, set `TAILSCALE_AUTH_KEY` and `TAILSCALE_HOSTNAME` in `.env` before running `scripts/install.sh`.

Do not expose Hermes or PostgreSQL publicly. The only public edge required for WhatsApp Cloud API is the signed webhook URL that forwards to Atlas API.
