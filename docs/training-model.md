# Training Model

Atlas stores training as structured facts so the agent can reason about plans, actual workouts, and set-level work without depending on memory as the source of truth.

## Tables

- `training_plans`: longer-lived programs or blocks.
- `planned_workouts`: scheduled or proposed sessions from chat, manual entry, iOS, or imports.
- `planned_workout_exercises`: ordered exercises inside a planned workout.
- `planned_workout_sets`: target sets, reps, load, duration, distance, RPE, and rest.
- `performed_workouts`: actual sessions from HealthKit, iOS bridge, manual entry, agent chat, or third-party imports.
- `performed_workout_exercises`: ordered exercise details inside a performed workout.
- `performed_workout_sets`: completed, partial, skipped, or failed set records.

HealthKit can populate performed workout summaries through `HKWorkout` data such as activity type, start/end, duration, energy, distance, and related samples. Gym-specific set prescriptions are not treated as guaranteed HealthKit facts; they can come from chat, manual app entry, or a specialized tracker and still land in the same deterministic tables.

## Sources

Planned workouts use:

- `agent_chat`
- `ios_bridge`
- `manual`
- `import`

Performed workouts use:

- `healthkit`
- `ios_bridge`
- `manual`
- `agent_chat`
- `third_party`

Use `externalId` whenever the source has a stable identifier, such as a HealthKit workout UUID or local mobile id. Atlas upserts by `userId + source + externalId`, then replaces child exercises and sets so retries are safe.

## Hermes Context Access

When an agent has the `training` Atlas capability, the generated Hermes `atlas-context` skill instructs Hermes to use the Atlas MCP tool for deterministic context. The snapshot contains recent user-scoped planned workouts, performed workouts, exercises, and sets. Hermes does not receive direct database access; Atlas decides which structured facts are exposed for the requested user and agent.

## Privacy

Training records are user-scoped. The iOS bridge can write only for the paired user, and shared agents should receive training facts only when the user intentionally shares them or when Atlas records an active grant.

Changing training goals, committing another person to a workout, or sharing training details outside the user's workspace should go through approvals.
