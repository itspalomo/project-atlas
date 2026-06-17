# Hermes Runtime

Hermes is the Atlas runtime. Atlas keeps runtime-specific behavior native to Hermes and only generates profile customizations.

Profile names come from `ecosystem/atlas.yaml`.

Run:

```bash
scripts/init-hermes-profiles.sh
docker compose --profile runtime up -d --build hermes
```

This starts Hermes with generated profiles, native Atlas capability skills, the Atlas MCP server config, Hermes WhatsApp gateway allowlists, and Honcho memory-provider config.

Leave `ATLAS_RUNTIME_MODE=stub` unless you intentionally use the legacy Atlas chat proxy for local testing.
