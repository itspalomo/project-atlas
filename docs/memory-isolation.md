# Memory Isolation

Atlas starts with one Honcho deployment and three workspaces:

| Workspace | Users | Agent | Rule |
| --- | --- | --- | --- |
| `jose` | Jose, Atlas Jose | `atlas-jose` | Private to Jose |
| `wife` | Wife, Atlas Wife | `atlas-wife` | Private to Wife |
| `family` | Jose, Wife, Atlas Family | `atlas-family` | Explicit shared memory only |

## Rules

- Private memories are never copied to another private workspace automatically.
- Family memory receives only intentionally shared facts or conversations.
- Structured facts live in PostgreSQL first, not memory.
- Memory grants are recorded in `shared_memory_grants`.
- Revocation should stop future access; historical memory deletion depends on Honcho retention behavior and must be handled explicitly.

## Examples

Private:

- `Jose wants to learn ROS2.`
- `Wife prefers evening workouts.`

Shared:

- `Family vacation scheduled for July.`
- `We need groceries for Friday dinner.`
