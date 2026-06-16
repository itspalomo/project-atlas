# Tailscale

Atlas uses Tailscale for private administration and future private app-to-server traffic.

Recommended host setup:

```bash
sudo tailscale up --ssh --hostname project-atlas
```

For non-interactive VPS bootstrap, set `TAILSCALE_AUTH_KEY` and `TAILSCALE_HOSTNAME` in `.env` before running `scripts/install.sh`.

`scripts/install-tailscale.sh` is idempotent. It installs Tailscale only when the CLI is missing, starts `tailscaled` when possible, and skips `tailscale up` when `tailscale status --json` reports `BackendState: Running`.

## WhatsApp Webhook Funnel

Atlas uses Tailscale Funnel for the public WhatsApp Cloud API callback:

```bash
scripts/atlasctl webhook
```

This runs a path-scoped Funnel for `/webhooks/whatsapp` and proxies it to the host-local Atlas API. Funnel must be enabled in your Tailscale admin console or tailnet policy before the command can succeed.

Do not expose Hermes, Honcho, or PostgreSQL publicly. The only public edge required for WhatsApp Cloud API is the signed webhook URL that forwards to Atlas API.
