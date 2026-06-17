# Hermes Profile Assets

Hermes profile assets are generated from the local `ecosystem/atlas.yaml` file.

Run:

```bash
scripts/init-hermes-profiles.sh
```

The generated files are written under `data/hermes/profiles/` and are intentionally not committed:

- `config.yaml` enables Hermes' native Honcho memory provider with `memory.provider: honcho`.
- `config.yaml` also registers the Atlas MCP server so Hermes can call custom Atlas tools through its native MCP system.
- `SOUL.md` contains minimal Atlas runtime context.
- `skills/atlas-context/SKILL.md` is a native Hermes skill describing the enabled Atlas custom data capabilities.
- `atlas-capabilities.json` contains the machine-readable Atlas capability manifest.
- `honcho.json` points the Hermes Honcho provider at the configured self-hosted Honcho workspace.
- `../atlas.env` contains Hermes gateway allowlists generated from configured WhatsApp identities.

Compose mounts `data/hermes` at `/opt/data`, so generated profile files sit under the Hermes data root used by the container.

Atlas keeps profile names, Honcho workspace IDs, custom capability metadata, and identity metadata in PostgreSQL. Hermes remains the runtime and owns native gateway, skill, MCP, and memory-provider behavior.

Generation is convergent: current configured profiles are rewritten, and stale generated profile directories from the previous manifest are removed.
