# Tailscale

Atlas uses Tailscale for private administration and future private app-to-server traffic.

Recommended host setup:

```bash
sudo tailscale up --ssh --hostname project-atlas
```

For non-interactive VPS bootstrap, set `TAILSCALE_AUTH_KEY` and `TAILSCALE_HOSTNAME` in `.env` before running `scripts/install.sh`.

`scripts/install-tailscale.sh` is idempotent. It installs Tailscale only when the CLI is missing, starts `tailscaled` when possible, and skips `tailscale up` when `tailscale status --json` reports `BackendState: Running`.

## WhatsApp Webhook Funnel

Atlas uses Tailscale Funnel for Hermes' public WhatsApp Cloud API callback:

```bash
scripts/atlasctl webhook
```

This runs a path-scoped Funnel for `/whatsapp/webhook` and proxies it to Hermes' host-local WhatsApp Cloud listener. Funnel must be enabled in your Tailscale admin console or tailnet policy before the command can succeed.

Do not expose the Hermes dashboard/API, Honcho, or PostgreSQL publicly. The only public edge required for WhatsApp Cloud API is the signed webhook URL that forwards to Hermes' WhatsApp listener.
