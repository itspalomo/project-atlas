# Hermes Profile Assets

Hermes profile assets are generated from the local `ecosystem/atlas.yaml` file.

Run:

```bash
scripts/init-hermes-profiles.sh
```

The generated files are written under `data/hermes/profiles/` and are intentionally not committed:

- `SOUL.md` contains the agent prompt plus enabled skill guidance.
- `skills.json` contains the machine-readable baked-in skill manifest.
- `honcho.json` points the profile at the configured self-hosted Honcho workspace.

Atlas keeps profile names, Honcho workspace IDs, skill manifests, and channel allowlists in PostgreSQL. Hermes remains the runtime and can be replaced later without changing Atlas identity records.

Generation is convergent: current configured profiles are rewritten, and stale generated profile directories from the previous manifest are removed.
