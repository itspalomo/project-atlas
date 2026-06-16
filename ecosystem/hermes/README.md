# Hermes Profile Assets

Hermes profile assets are generated from the local `ecosystem/atlas.yaml` file.

Run:

```bash
scripts/init-hermes-profiles.sh
```

The generated files are written under `data/hermes/profiles/` and are intentionally not committed. Atlas keeps profile names, Honcho workspace IDs, and channel allowlists in PostgreSQL. Hermes remains the runtime and can be replaced later without changing Atlas identity records.

Generation is convergent: current configured profiles are rewritten, and stale generated profile directories from the previous manifest are removed.
