import { Pool } from "pg";

export type DeterministicContext = {
  content: string;
  sections: string[];
};

export type DeterministicContextInput = {
  userId: string;
  agentId: string;
  skills: string[];
};

type PlannedWorkoutRow = {
  id: string;
  title: string;
  workout_type: string;
  status: string;
  scheduled_start_at: Date | string | null;
  scheduled_end_at: Date | string | null;
  notes: string | null;
};

type PlannedExerciseContextRow = {
  workout_id: string;
  name: string;
  sets: Array<{
    setIndex?: number | null;
    setType?: string | null;
    targetRepsMin?: number | null;
    targetRepsMax?: number | null;
    targetWeightKg?: string | number | null;
    targetDurationSeconds?: number | null;
    targetDistanceMeters?: string | number | null;
    targetRpe?: string | number | null;
    restSeconds?: number | null;
  }>;
};

type PerformedWorkoutRow = {
  id: string;
  workout_type: string;
  source: string;
  source_device: string;
  started_at: Date | string;
  ended_at: Date | string;
  duration_minutes: string | number | null;
  active_energy_kcal: string | number | null;
  perceived_effort: string | number | null;
};

type PerformedExerciseContextRow = {
  workout_id: string;
  name: string;
  sets: Array<{
    setIndex?: number | null;
    setType?: string | null;
    status?: string | null;
    reps?: number | null;
    weightKg?: string | number | null;
    durationSeconds?: number | null;
    distanceMeters?: string | number | null;
    rpe?: string | number | null;
  }>;
};

export async function buildDeterministicContext(
  pool: Pool,
  input: DeterministicContextInput
): Promise<DeterministicContext> {
  const sections: string[] = [];
  const blocks: string[] = [];

  if (input.skills.includes("training")) {
    const trainingBlock = await buildTrainingContext(pool, input.userId);
    if (trainingBlock) {
      sections.push("training");
      blocks.push(trainingBlock);
    }
  }

  if (blocks.length === 0) {
    return { content: "", sections: [] };
  }

  return {
    sections,
    content: [
      "# Atlas Deterministic Context",
      "",
      `Scope: structured facts for user ${input.userId} and agent ${input.agentId}.`,
      "Use these facts as current Atlas state. Do not infer missing planned sets, performed sets, health data, or private context.",
      "",
      ...blocks
    ].join("\n")
  };
}

async function buildTrainingContext(pool: Pool, userId: string): Promise<string> {
  const plannedResult = await pool.query<PlannedWorkoutRow>(
    `
      select id, title, workout_type, status, scheduled_start_at, scheduled_end_at, notes
      from planned_workouts
      where user_id = $1
        and status in ('planned', 'completed')
      order by scheduled_start_at desc nulls last, created_at desc
      limit 5
    `,
    [userId]
  );
  const performedResult = await pool.query<PerformedWorkoutRow>(
    `
      select id, workout_type, source, source_device, started_at, ended_at, duration_minutes, active_energy_kcal, perceived_effort
      from performed_workouts
      where user_id = $1
      order by started_at desc
      limit 5
    `,
    [userId]
  );

  if (plannedResult.rows.length === 0 && performedResult.rows.length === 0) {
    return "";
  }

  const plannedExercises = await loadPlannedExerciseContext(
    pool,
    plannedResult.rows.map((row) => row.id)
  );
  const performedExercises = await loadPerformedExerciseContext(
    pool,
    performedResult.rows.map((row) => row.id)
  );

  const lines = ["## Training"];

  if (plannedResult.rows.length > 0) {
    lines.push("", "Planned workouts:");
    for (const workout of plannedResult.rows) {
      lines.push(formatPlannedWorkout(workout));
      for (const exercise of plannedExercises.get(workout.id) ?? []) {
        lines.push(`  - ${exercise.name}${formatPlannedSets(exercise.sets)}`);
      }
    }
  }

  if (performedResult.rows.length > 0) {
    lines.push("", "Recent performed workouts:");
    for (const workout of performedResult.rows) {
      lines.push(formatPerformedWorkout(workout));
      for (const exercise of performedExercises.get(workout.id) ?? []) {
        lines.push(`  - ${exercise.name}${formatPerformedSets(exercise.sets)}`);
      }
    }
  }

  return lines.join("\n");
}

async function loadPlannedExerciseContext(
  pool: Pool,
  workoutIds: string[]
): Promise<Map<string, PlannedExerciseContextRow[]>> {
  const byWorkout = new Map<string, PlannedExerciseContextRow[]>();
  if (workoutIds.length === 0) {
    return byWorkout;
  }

  const result = await pool.query<PlannedExerciseContextRow>(
    `
      select
        exercises.planned_workout_id as workout_id,
        exercises.name,
        coalesce(
          json_agg(
            json_build_object(
              'setIndex', sets.set_index,
              'setType', sets.set_type,
              'targetRepsMin', sets.target_reps_min,
              'targetRepsMax', sets.target_reps_max,
              'targetWeightKg', sets.target_weight_kg,
              'targetDurationSeconds', sets.target_duration_seconds,
              'targetDistanceMeters', sets.target_distance_meters,
              'targetRpe', sets.target_rpe,
              'restSeconds', sets.rest_seconds
            )
            order by sets.set_index
          ) filter (where sets.id is not null),
          '[]'::json
        ) as sets
      from planned_workout_exercises exercises
      left join planned_workout_sets sets on sets.planned_exercise_id = exercises.id
      where exercises.planned_workout_id = any($1::uuid[])
      group by exercises.id
      order by exercises.planned_workout_id, exercises.order_index
    `,
    [workoutIds]
  );

  for (const row of result.rows) {
    byWorkout.set(row.workout_id, [...(byWorkout.get(row.workout_id) ?? []), row]);
  }

  return byWorkout;
}

async function loadPerformedExerciseContext(
  pool: Pool,
  workoutIds: string[]
): Promise<Map<string, PerformedExerciseContextRow[]>> {
  const byWorkout = new Map<string, PerformedExerciseContextRow[]>();
  if (workoutIds.length === 0) {
    return byWorkout;
  }

  const result = await pool.query<PerformedExerciseContextRow>(
    `
      select
        exercises.performed_workout_id as workout_id,
        exercises.name,
        coalesce(
          json_agg(
            json_build_object(
              'setIndex', sets.set_index,
              'setType', sets.set_type,
              'status', sets.status,
              'reps', sets.reps,
              'weightKg', sets.weight_kg,
              'durationSeconds', sets.duration_seconds,
              'distanceMeters', sets.distance_meters,
              'rpe', sets.rpe
            )
            order by sets.set_index
          ) filter (where sets.id is not null),
          '[]'::json
        ) as sets
      from performed_workout_exercises exercises
      left join performed_workout_sets sets on sets.performed_exercise_id = exercises.id
      where exercises.performed_workout_id = any($1::uuid[])
      group by exercises.id
      order by exercises.performed_workout_id, exercises.order_index
    `,
    [workoutIds]
  );

  for (const row of result.rows) {
    byWorkout.set(row.workout_id, [...(byWorkout.get(row.workout_id) ?? []), row]);
  }

  return byWorkout;
}

function formatPlannedWorkout(workout: PlannedWorkoutRow): string {
  return compact([
    `- ${workout.title}`,
    `[${workout.status}]`,
    `type ${workout.workout_type}`,
    workout.scheduled_start_at ? `scheduled ${toIso(workout.scheduled_start_at)}` : undefined,
    workout.notes ? `notes: ${workout.notes}` : undefined
  ]).join(" ");
}

function formatPerformedWorkout(workout: PerformedWorkoutRow): string {
  return compact([
    `- ${workout.workout_type}`,
    `from ${workout.source}/${workout.source_device}`,
    `started ${toIso(workout.started_at)}`,
    workout.duration_minutes !== null ? `duration ${toNumber(workout.duration_minutes)} min` : undefined,
    workout.active_energy_kcal !== null ? `active ${toNumber(workout.active_energy_kcal)} kcal` : undefined,
    workout.perceived_effort !== null ? `RPE ${toNumber(workout.perceived_effort)}` : undefined
  ]).join(" ");
}

function formatPlannedSets(sets: PlannedExerciseContextRow["sets"]): string {
  if (sets.length === 0) {
    return "";
  }

  return `: ${sets.map(formatPlannedSet).join("; ")}`;
}

function formatPlannedSet(set: PlannedExerciseContextRow["sets"][number]): string {
  const reps =
    set.targetRepsMin !== null && set.targetRepsMin !== undefined
      ? set.targetRepsMax !== null && set.targetRepsMax !== undefined && set.targetRepsMax !== set.targetRepsMin
        ? `${set.targetRepsMin}-${set.targetRepsMax} reps`
        : `${set.targetRepsMin} reps`
      : undefined;

  return compact([
    `set ${(set.setIndex ?? 0) + 1}`,
    set.setType ?? undefined,
    reps,
    set.targetWeightKg !== null && set.targetWeightKg !== undefined ? `@ ${toNumber(set.targetWeightKg)} kg` : undefined,
    set.targetDurationSeconds !== null && set.targetDurationSeconds !== undefined
      ? `${set.targetDurationSeconds}s`
      : undefined,
    set.targetDistanceMeters !== null && set.targetDistanceMeters !== undefined
      ? `${toNumber(set.targetDistanceMeters)}m`
      : undefined,
    set.targetRpe !== null && set.targetRpe !== undefined ? `target RPE ${toNumber(set.targetRpe)}` : undefined,
    set.restSeconds !== null && set.restSeconds !== undefined ? `rest ${set.restSeconds}s` : undefined
  ]).join(" ");
}

function formatPerformedSets(sets: PerformedExerciseContextRow["sets"]): string {
  if (sets.length === 0) {
    return "";
  }

  return `: ${sets.map(formatPerformedSet).join("; ")}`;
}

function formatPerformedSet(set: PerformedExerciseContextRow["sets"][number]): string {
  return compact([
    `set ${(set.setIndex ?? 0) + 1}`,
    set.status ?? undefined,
    set.reps !== null && set.reps !== undefined ? `${set.reps} reps` : undefined,
    set.weightKg !== null && set.weightKg !== undefined ? `@ ${toNumber(set.weightKg)} kg` : undefined,
    set.durationSeconds !== null && set.durationSeconds !== undefined ? `${set.durationSeconds}s` : undefined,
    set.distanceMeters !== null && set.distanceMeters !== undefined ? `${toNumber(set.distanceMeters)}m` : undefined,
    set.rpe !== null && set.rpe !== undefined ? `RPE ${toNumber(set.rpe)}` : undefined
  ]).join(" ");
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

function toNumber(value: string | number): number {
  return typeof value === "number" ? value : Number(value);
}

function compact<T>(values: Array<T | undefined | null | false>): T[] {
  return values.filter((value): value is T => Boolean(value));
}
