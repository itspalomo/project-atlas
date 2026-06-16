# Hermes Runtime

Hermes is the initial Atlas runtime. Atlas keeps runtime-specific configuration thin so Hermes can be replaced later.

Profile names come from `ecosystem/atlas.yaml`.

Run:

```bash
scripts/init-hermes-profiles.sh
docker compose --profile runtime up -d --build hermes
```

Then set `ATLAS_RUNTIME_MODE=hermes` once each profile endpoint is reachable.
