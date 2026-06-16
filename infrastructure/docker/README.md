# Docker

The root `compose.yaml` is the deployment entry point. It keeps the developer command short while still keeping infrastructure notes under `infrastructure/`.

Default services:

- `postgres`: Atlas structured-data store.
- `atlas-api`: identity router, WhatsApp webhook, approval API, and iOS bridge API.

Profiles:

- `runtime`: starts the Hermes runtime container.
- `public-webhook`: starts Cloudflare Tunnel for the public WhatsApp webhook edge.

The Atlas API should be reachable publicly only for `/webhooks/whatsapp` when using WhatsApp Cloud API. Hermes and PostgreSQL bind to localhost by default and are intended to be administered through Tailscale SSH or a private reverse proxy.
