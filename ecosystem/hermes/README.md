# Hermes Profile Assets

Hermes profile assets are generated from the local `ecosystem/atlas.yaml` file.

Run:

```bash
scripts/init-hermes-profiles.sh
```

The generated files are written under `data/hermes/profiles/` and are intentionally not committed:

- `config.yaml` is merged in place to enable Hermes' native Honcho memory provider with `memory.provider: honcho`.
- `config.yaml` is also merged in place to register the Atlas MCP server so Hermes can call custom Atlas tools through its native MCP system.
- `skills/atlas-context/SKILL.md` is a native Hermes skill describing the enabled Atlas custom data capabilities.
- `atlas-capabilities.json` contains the machine-readable Atlas capability manifest.
- `honcho.json` points the Hermes Honcho provider at the configured self-hosted Honcho workspace.
- `.env` keeps Hermes-owned credentials and includes an Atlas-managed allowlist block generated from the profile's configured owners, members, and matching default identities.

Compose mounts `data/hermes` at `/opt/data`, so generated profile files sit under the Hermes data root used by the container.

Atlas keeps profile names, Honcho workspace IDs, custom capability metadata, and identity metadata in PostgreSQL. Hermes remains the runtime and owns native gateway, skill, MCP, and memory-provider behavior.

Generation is convergent for Atlas-managed files. Existing Hermes-owned profile state, credentials, sessions, and `SOUL.md` are preserved.
