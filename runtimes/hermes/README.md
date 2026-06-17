# Hermes Runtime

Hermes is the Atlas runtime. Atlas keeps runtime-specific behavior native to Hermes and only generates profile customizations.

Profile names come from `ecosystem/atlas.yaml`.

Run:

```bash
scripts/init-hermes-profiles.sh
docker compose --profile runtime up -d --build hermes
```

This starts Hermes with generated profiles, native Atlas capability skills, the Atlas MCP server config, Hermes WhatsApp gateway allowlists, and Honcho memory-provider config.

For the normal multi-agent case, use one Hermes container with many profiles. Each configured Atlas agent becomes a Hermes profile with its own `config.yaml`, `.env`, skills, Honcho workspace, sessions, and gateway state.

Use separate Hermes containers only when you intentionally need stronger resource, network, image-version, or compliance isolation.
