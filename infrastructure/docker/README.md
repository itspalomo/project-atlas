# Docker

The root `compose.yaml` is the deployment entry point. It keeps the developer command short while still keeping infrastructure notes under `infrastructure/`.

Default services:

- `postgres`: Atlas structured-data store.
- `atlas-api`: identity router, WhatsApp webhook, approval API, and iOS bridge API.

Profiles:

- `runtime`: starts the Hermes runtime container.

The Atlas API should be reachable publicly only for `/webhooks/whatsapp` when using WhatsApp Cloud API. That public path is published with Tailscale Funnel from the host, not a Docker sidecar. Hermes, Honcho, and PostgreSQL bind to localhost by default and are intended to be administered through Tailscale SSH.
