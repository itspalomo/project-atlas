# Docker

The root `compose.yaml` is the deployment entry point. It keeps the developer command short while still keeping infrastructure notes under `infrastructure/`.

Default services:

- `postgres`: Atlas structured-data store.
- `atlas-api`: structured identity metadata, approvals, and iOS bridge API.

Profiles:

- `runtime`: starts the Hermes runtime container.

The public WhatsApp Cloud API path is Hermes' `/whatsapp/webhook`, published with Tailscale Funnel from the host. Hermes dashboard/API, Honcho, Atlas API, and PostgreSQL bind to localhost by default and are intended to be administered through Tailscale SSH.
