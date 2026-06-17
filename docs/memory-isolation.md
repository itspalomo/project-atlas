# Memory Isolation

Atlas starts one self-hosted Honcho deployment and creates Hermes-native Honcho provider config from `ecosystem/atlas.yaml`.

| Workspace | Users | Agent | Rule |
| --- | --- | --- | --- |
| `household` | configured members | configured shared agent | Shared only for listed members |
| `user-one` | configured user | optional personal agent | Private to that user |

## Rules

- Generated Hermes profiles point at the configured Honcho workspace for that agent.
- Private memories are never copied to another workspace automatically by Atlas.
- Shared memory receives only intentionally shared facts or conversations.
- Structured facts live in PostgreSQL first, not memory.
- Memory grants are recorded in `shared_memory_grants` for deterministic sharing decisions.
- Hermes owns Honcho provider reads and writes through profile-local `config.yaml` and `honcho.json`.
- Revocation should stop future Atlas-mediated access; historical memory deletion depends on Honcho retention behavior and must be handled explicitly.

## Examples

Private:

- `A user wants to learn ROS2.`
- `A user prefers evening workouts.`

Shared:

- `Family vacation scheduled for July.`
- `We need groceries for Friday dinner.`
