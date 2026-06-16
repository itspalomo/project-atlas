# Hermes Profile Assets

The `ecosystem/atlas-*` directories hold Atlas-owned identity prompts. `scripts/init-hermes-profiles.sh` copies these into the Hermes data volume and creates the matching Hermes profiles:

- `atlas-jose`
- `atlas-wife`
- `atlas-family`

Atlas keeps profile names, Honcho workspace IDs, and channel allowlists in PostgreSQL. Hermes remains the runtime and can be replaced later without changing Atlas identity records.
