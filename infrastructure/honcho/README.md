# Honcho

Atlas treats Honcho as the memory layer and stores only workspace identifiers in PostgreSQL.

Initial workspaces:

- `jose`: private to Jose and `atlas-jose`.
- `wife`: private to Wife and `atlas-wife`.
- `family`: shared only by explicit action and `atlas-family`.

Use `scripts/install-honcho.sh` to clone and start the current Honcho self-hosting stack, then set:

```bash
HONCHO_BASE_URL=http://127.0.0.1:8000
HONCHO_API_KEY=<key-if-configured>
```

Atlas does not automatically copy data between Honcho workspaces. Shared memory must go through `shared_memory_grants` or explicit shared writes to the family workspace.
