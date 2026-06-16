# Memory Isolation

Atlas starts one self-hosted Honcho deployment and creates memory workspace names from `ecosystem/atlas.yaml`.

| Workspace | Users | Agent | Rule |
| --- | --- | --- | --- |
| `household` | configured members | configured shared agent | Shared only for listed members |
| `user-one` | configured user | optional personal agent | Private to that user |

## Rules

- Private memories are never copied to another workspace automatically.
- Shared memory receives only intentionally shared facts or conversations.
- Structured facts live in PostgreSQL first, not memory.
- Memory grants are recorded in `shared_memory_grants`.
- Revocation should stop future access; historical memory deletion depends on Honcho retention behavior and must be handled explicitly.

## Examples

Private:

- `A user wants to learn ROS2.`
- `A user prefers evening workouts.`

Shared:

- `Family vacation scheduled for July.`
- `We need groceries for Friday dinner.`
