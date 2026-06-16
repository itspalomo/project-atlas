import { FastifyInstance } from "fastify";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { Pool, PoolClient } from "pg";
import { AtlasConfig } from "../config.js";
import {
  assertBridgeBootstrap,
  assertBridgeUser,
  authenticateBridgeRequest,
  BridgeAuthError,
  hashBridgeToken
} from "./bridgeAuth.js";
import { recordAuditLog } from "../audit/auditLog.js";
import { canUseAgent } from "../identity/identityService.js";

const healthSummarySchema = z.object({
  userId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  source: z.enum(["iphone", "apple_watch", "manual", "mixed"]),
  steps: z.number().int().nonnegative().optional(),
  activeEnergyKcal: z.number().nonnegative().optional(),
  exerciseMinutes: z.number().nonnegative().optional(),
  standMinutes: z.number().nonnegative().optional(),
  sleepMinutes: z.number().nonnegative().optional(),
  weightKg: z.number().positive().optional(),
  workouts: z
    .array(
      z.object({
        type: z.string().min(1),
        startedAt: z.string().datetime(),
        endedAt: z.string().datetime(),
        durationMinutes: z.number().nonnegative(),
        activeEnergyKcal: z.number().nonnegative().optional()
      })
    )
    .default([]),
  generatedAt: z.string().datetime()
});

const registerBridgeDeviceSchema = z.object({
  userId: z.string().min(1),
  displayName: z.string().min(1).max(120)
});

const calendarBusyBlocksSchema = z.object({
  userId: z.string().min(1),
  windowStart: z.string().datetime(),
  windowEnd: z.string().datetime(),
  blocks: z.array(
    z.object({
      startsAt: z.string().datetime(),
      endsAt: z.string().datetime(),
      availabilityType: z.enum(["busy", "tentative", "out_of_office"]).default("busy"),
      sourceCalendarHash: z.string().min(8).optional()
    })
  )
});

const locationSignalSchema = z.object({
  userId: z.string().min(1),
  observedAt: z.string().datetime(),
  place: z.enum(["home", "work", "gym", "school", "unknown"]),
  confidence: z.number().min(0).max(1),
  source: z.enum(["ios", "manual"])
});

const nutritionSourceSchema = z.enum(["ios_bridge", "manual", "third_party_app", "photo_estimate", "nutrition_label"]);

const nutritionDailySummarySchema = z.object({
  userId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  source: nutritionSourceSchema,
  energyKcal: z.number().nonnegative().optional(),
  proteinG: z.number().nonnegative().optional(),
  carbsG: z.number().nonnegative().optional(),
  fatG: z.number().nonnegative().optional(),
  fiberG: z.number().nonnegative().optional(),
  sugarG: z.number().nonnegative().optional(),
  sodiumMg: z.number().nonnegative().optional(),
  waterMl: z.number().nonnegative().optional(),
  mealCount: z.number().int().nonnegative().optional(),
  confidence: z.number().min(0).max(1).optional(),
  notes: z.string().max(2000).optional(),
  generatedAt: z.string().datetime()
});

const nutritionMealEntrySchema = z.object({
  userId: z.string().min(1),
  externalId: z.string().min(1).max(200).optional(),
  consumedAt: z.string().datetime(),
  mealType: z.enum(["breakfast", "lunch", "dinner", "snack", "unknown"]).default("unknown"),
  source: nutritionSourceSchema,
  description: z.string().max(500).optional(),
  energyKcal: z.number().nonnegative().optional(),
  proteinG: z.number().nonnegative().optional(),
  carbsG: z.number().nonnegative().optional(),
  fatG: z.number().nonnegative().optional(),
  fiberG: z.number().nonnegative().optional(),
  sugarG: z.number().nonnegative().optional(),
  sodiumMg: z.number().nonnegative().optional(),
  waterMl: z.number().nonnegative().optional(),
  confidence: z.number().min(0).max(1).optional(),
  metadata: z.record(z.string(), z.unknown()).default({})
});

const trainingPlanSourceSchema = z.enum(["agent_chat", "ios_bridge", "manual", "import"]);
const plannedWorkoutStatusSchema = z.enum(["planned", "completed", "skipped", "cancelled"]);
const plannedSetTypeSchema = z.enum(["warmup", "working", "drop", "backoff", "amrap", "cooldown", "unknown"]);
const performedWorkoutSourceSchema = z.enum(["healthkit", "ios_bridge", "manual", "agent_chat", "third_party"]);
const workoutSourceDeviceSchema = z.enum(["iphone", "apple_watch", "manual", "mixed", "unknown"]);
const performedSetStatusSchema = z.enum(["completed", "partial", "skipped", "failed"]);

const trainingPlanSchema = z.object({
  userId: z.string().min(1),
  agentId: z.string().min(1).optional(),
  externalId: z.string().min(1).max(200).optional(),
  title: z.string().min(1).max(240),
  description: z.string().max(5000).optional(),
  status: z.enum(["active", "paused", "completed", "cancelled"]).default("active"),
  source: trainingPlanSourceSchema.default("manual"),
  startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  metadata: z.record(z.string(), z.unknown()).default({})
}).superRefine((plan, context) => {
  if (plan.startsOn && plan.endsOn && plan.endsOn < plan.startsOn) {
    context.addIssue({
      code: "custom",
      message: "endsOn must be after or equal to startsOn",
      path: ["endsOn"]
    });
  }
});

const plannedWorkoutSetSchema = z.object({
  setIndex: z.number().int().nonnegative().optional(),
  setType: plannedSetTypeSchema.default("working"),
  targetRepsMin: z.number().int().nonnegative().optional(),
  targetRepsMax: z.number().int().nonnegative().optional(),
  targetWeightKg: z.number().nonnegative().optional(),
  targetDurationSeconds: z.number().int().nonnegative().optional(),
  targetDistanceMeters: z.number().nonnegative().optional(),
  targetRpe: z.number().min(0).max(10).optional(),
  restSeconds: z.number().int().nonnegative().optional(),
  notes: z.string().max(2000).optional(),
  metadata: z.record(z.string(), z.unknown()).default({})
}).superRefine((set, context) => {
  if (
    set.targetRepsMin !== undefined &&
    set.targetRepsMax !== undefined &&
    set.targetRepsMax < set.targetRepsMin
  ) {
    context.addIssue({
      code: "custom",
      message: "targetRepsMax must be greater than or equal to targetRepsMin",
      path: ["targetRepsMax"]
    });
  }
});

const plannedWorkoutExerciseSchema = z.object({
  exerciseKey: z.string().min(1).max(120).optional(),
  name: z.string().min(1).max(200),
  orderIndex: z.number().int().nonnegative().optional(),
  notes: z.string().max(2000).optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  sets: z.array(plannedWorkoutSetSchema).default([])
});

const plannedWorkoutSchema = z.object({
  userId: z.string().min(1),
  trainingPlanId: z.string().uuid().optional(),
  createdByAgentId: z.string().min(1).optional(),
  approvalId: z.string().uuid().optional(),
  externalId: z.string().min(1).max(200).optional(),
  title: z.string().min(1).max(240),
  workoutType: z.string().min(1).max(120),
  scheduledStartAt: z.string().datetime().optional(),
  scheduledEndAt: z.string().datetime().optional(),
  status: plannedWorkoutStatusSchema.default("planned"),
  source: trainingPlanSourceSchema.default("manual"),
  targetDurationMinutes: z.number().nonnegative().optional(),
  targetEnergyKcal: z.number().nonnegative().optional(),
  notes: z.string().max(5000).optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  exercises: z.array(plannedWorkoutExerciseSchema).default([])
}).superRefine((workout, context) => {
  if (
    workout.scheduledStartAt &&
    workout.scheduledEndAt &&
    new Date(workout.scheduledEndAt).getTime() <= new Date(workout.scheduledStartAt).getTime()
  ) {
    context.addIssue({
      code: "custom",
      message: "scheduledEndAt must be after scheduledStartAt",
      path: ["scheduledEndAt"]
    });
  }
});

const performedWorkoutSetSchema = z.object({
  setIndex: z.number().int().nonnegative().optional(),
  setType: plannedSetTypeSchema.default("working"),
  status: performedSetStatusSchema.default("completed"),
  reps: z.number().int().nonnegative().optional(),
  weightKg: z.number().nonnegative().optional(),
  durationSeconds: z.number().int().nonnegative().optional(),
  distanceMeters: z.number().nonnegative().optional(),
  rpe: z.number().min(0).max(10).optional(),
  completedAt: z.string().datetime().optional(),
  notes: z.string().max(2000).optional(),
  metadata: z.record(z.string(), z.unknown()).default({})
});

const performedWorkoutExerciseSchema = z.object({
  exerciseKey: z.string().min(1).max(120).optional(),
  name: z.string().min(1).max(200),
  orderIndex: z.number().int().nonnegative().optional(),
  notes: z.string().max(2000).optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  sets: z.array(performedWorkoutSetSchema).default([])
});

const performedWorkoutSchema = z.object({
  userId: z.string().min(1),
  plannedWorkoutId: z.string().uuid().optional(),
  externalId: z.string().min(1).max(200).optional(),
  workoutType: z.string().min(1).max(120),
  source: performedWorkoutSourceSchema,
  sourceDevice: workoutSourceDeviceSchema.default("unknown"),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime(),
  durationMinutes: z.number().nonnegative().optional(),
  activeEnergyKcal: z.number().nonnegative().optional(),
  totalEnergyKcal: z.number().nonnegative().optional(),
  distanceMeters: z.number().nonnegative().optional(),
  averageHeartRateBpm: z.number().nonnegative().optional(),
  maxHeartRateBpm: z.number().nonnegative().optional(),
  perceivedEffort: z.number().min(0).max(10).optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  exercises: z.array(performedWorkoutExerciseSchema).default([])
}).superRefine((workout, context) => {
  if (new Date(workout.endedAt).getTime() <= new Date(workout.startedAt).getTime()) {
    context.addIssue({
      code: "custom",
      message: "endedAt must be after startedAt",
      path: ["endedAt"]
    });
  }
});

const trainingWorkoutQuerySchema = z.object({
  userId: z.string().min(1),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50)
});

const trainingPlanQuerySchema = z.object({
  userId: z.string().min(1),
  status: z.enum(["active", "paused", "completed", "cancelled"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50)
});

const approvalDecisionSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  decidedByUserId: z.string().min(1),
  reason: z.string().max(2000).optional()
});

export async function registerBridgeRoutes(
  app: FastifyInstance,
  pool: Pool,
  config: AtlasConfig
): Promise<void> {
  app.post("/bridge/v1/devices/register", async (request, reply) => {
    try {
      const principal = await authenticateBridgeRequest(request, pool, config);
      assertBridgeBootstrap(principal);
      const body = registerBridgeDeviceSchema.parse(request.body);
      const userResult = await pool.query<{ id: string }>("select id from users where id = $1 limit 1", [body.userId]);
      if (!userResult.rows[0]) {
        return reply.code(404).send({
          ok: false,
          error: "Unknown bridge user"
        });
      }

      const token = randomBytes(32).toString("base64url");

      const result = await pool.query<{ id: string }>(
        `
          insert into bridge_devices (user_id, display_name, token_hash)
          values ($1, $2, $3)
          returning id
        `,
        [body.userId, body.displayName, hashBridgeToken(token)]
      );

      await recordAuditLog(pool, {
        actorUserId: body.userId,
        action: "bridge.device.registered",
        subjectType: "bridge_device",
        subjectId: result.rows[0]?.id,
        metadata: { displayName: body.displayName }
      });

      return reply.code(201).send({
        ok: true,
        deviceId: result.rows[0]?.id,
        token
      });
    } catch (error) {
      return bridgeError(reply, error);
    }
  });

  app.post("/bridge/v1/health/daily-summary", async (request, reply) => {
    try {
      const principal = await authenticateBridgeRequest(request, pool, config);
      const body = healthSummarySchema.parse(request.body);
      assertBridgeUser(principal, body.userId);

      await pool.query(
        `
          insert into health_daily_summaries (
            user_id,
            summary_date,
            source,
            steps,
            active_energy_kcal,
            exercise_minutes,
            stand_minutes,
            sleep_minutes,
            weight_kg,
            workouts,
            generated_at
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11)
          on conflict (user_id, summary_date)
          do update set
            source = excluded.source,
            steps = excluded.steps,
            active_energy_kcal = excluded.active_energy_kcal,
            exercise_minutes = excluded.exercise_minutes,
            stand_minutes = excluded.stand_minutes,
            sleep_minutes = excluded.sleep_minutes,
            weight_kg = excluded.weight_kg,
            workouts = excluded.workouts,
            generated_at = excluded.generated_at,
            updated_at = now()
        `,
        [
          body.userId,
          body.date,
          body.source,
          body.steps ?? null,
          body.activeEnergyKcal ?? null,
          body.exerciseMinutes ?? null,
          body.standMinutes ?? null,
          body.sleepMinutes ?? null,
          body.weightKg ?? null,
          JSON.stringify(body.workouts),
          body.generatedAt
        ]
      );

      await recordAuditLog(pool, {
        actorUserId: body.userId,
        action: "bridge.health_daily_summary.upserted",
        subjectType: "health_daily_summary",
        subjectId: body.date,
        metadata: { source: body.source }
      });

      return reply.code(202).send({ ok: true });
    } catch (error) {
      return bridgeError(reply, error);
    }
  });

  app.post("/bridge/v1/calendar/busy-blocks", async (request, reply) => {
    try {
      const principal = await authenticateBridgeRequest(request, pool, config);
      const body = calendarBusyBlocksSchema.parse(request.body);
      assertBridgeUser(principal, body.userId);

      const client = await pool.connect();
      try {
        await client.query("begin");
        await client.query(
          `
            delete from calendar_busy_blocks
            where user_id = $1
              and starts_at >= $2
              and ends_at <= $3
          `,
          [body.userId, body.windowStart, body.windowEnd]
        );

        for (const block of body.blocks) {
          await client.query(
            `
              insert into calendar_busy_blocks (
                user_id,
                starts_at,
                ends_at,
                availability_type,
                source_calendar_hash
              )
              values ($1, $2, $3, $4, $5)
            `,
            [
              body.userId,
              block.startsAt,
              block.endsAt,
              block.availabilityType,
              block.sourceCalendarHash ?? null
            ]
          );
        }

        await client.query("commit");
      } catch (error) {
        await client.query("rollback");
        throw error;
      } finally {
        client.release();
      }

      await recordAuditLog(pool, {
        actorUserId: body.userId,
        action: "bridge.calendar_busy_blocks.synced",
        subjectType: "calendar_busy_blocks",
        metadata: {
          windowStart: body.windowStart,
          windowEnd: body.windowEnd,
          count: body.blocks.length
        }
      });

      return reply.code(202).send({ ok: true, count: body.blocks.length });
    } catch (error) {
      return bridgeError(reply, error);
    }
  });

  app.post("/bridge/v1/location/signal", async (request, reply) => {
    try {
      const principal = await authenticateBridgeRequest(request, pool, config);
      const body = locationSignalSchema.parse(request.body);
      assertBridgeUser(principal, body.userId);

      await pool.query(
        `
          insert into location_signals (
            user_id,
            observed_at,
            semantic_place,
            confidence,
            source
          )
          values ($1, $2, $3, $4, $5)
        `,
        [body.userId, body.observedAt, body.place, body.confidence, body.source]
      );

      await recordAuditLog(pool, {
        actorUserId: body.userId,
        action: "bridge.location_signal.created",
        subjectType: "location_signal",
        metadata: { place: body.place, confidence: body.confidence }
      });

      return reply.code(202).send({ ok: true });
    } catch (error) {
      return bridgeError(reply, error);
    }
  });

  app.post("/bridge/v1/nutrition/daily-summary", async (request, reply) => {
    try {
      const principal = await authenticateBridgeRequest(request, pool, config);
      const body = nutritionDailySummarySchema.parse(request.body);
      assertBridgeUser(principal, body.userId);

      await pool.query(
        `
          insert into nutrition_daily_summaries (
            user_id,
            summary_date,
            source,
            energy_kcal,
            protein_g,
            carbs_g,
            fat_g,
            fiber_g,
            sugar_g,
            sodium_mg,
            water_ml,
            meal_count,
            confidence,
            notes,
            generated_at
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
          on conflict (user_id, summary_date)
          do update set
            source = excluded.source,
            energy_kcal = excluded.energy_kcal,
            protein_g = excluded.protein_g,
            carbs_g = excluded.carbs_g,
            fat_g = excluded.fat_g,
            fiber_g = excluded.fiber_g,
            sugar_g = excluded.sugar_g,
            sodium_mg = excluded.sodium_mg,
            water_ml = excluded.water_ml,
            meal_count = excluded.meal_count,
            confidence = excluded.confidence,
            notes = excluded.notes,
            generated_at = excluded.generated_at,
            updated_at = now()
        `,
        [
          body.userId,
          body.date,
          body.source,
          body.energyKcal ?? null,
          body.proteinG ?? null,
          body.carbsG ?? null,
          body.fatG ?? null,
          body.fiberG ?? null,
          body.sugarG ?? null,
          body.sodiumMg ?? null,
          body.waterMl ?? null,
          body.mealCount ?? null,
          body.confidence ?? null,
          body.notes ?? null,
          body.generatedAt
        ]
      );

      await recordAuditLog(pool, {
        actorUserId: body.userId,
        action: "bridge.nutrition_daily_summary.upserted",
        subjectType: "nutrition_daily_summary",
        subjectId: body.date,
        metadata: { source: body.source, confidence: body.confidence ?? null }
      });

      return reply.code(202).send({ ok: true });
    } catch (error) {
      return bridgeError(reply, error);
    }
  });

  app.post("/bridge/v1/nutrition/meal-entry", async (request, reply) => {
    try {
      const principal = await authenticateBridgeRequest(request, pool, config);
      const body = nutritionMealEntrySchema.parse(request.body);
      assertBridgeUser(principal, body.userId);

      const result = await pool.query<{ id: string }>(
        `
          insert into nutrition_meal_entries (
            user_id,
            external_id,
            consumed_at,
            meal_type,
            source,
            description,
            energy_kcal,
            protein_g,
            carbs_g,
            fat_g,
            fiber_g,
            sugar_g,
            sodium_mg,
            water_ml,
            confidence,
            metadata
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16::jsonb)
          on conflict (user_id, source, external_id)
          where external_id is not null
          do update set
            consumed_at = excluded.consumed_at,
            meal_type = excluded.meal_type,
            description = excluded.description,
            energy_kcal = excluded.energy_kcal,
            protein_g = excluded.protein_g,
            carbs_g = excluded.carbs_g,
            fat_g = excluded.fat_g,
            fiber_g = excluded.fiber_g,
            sugar_g = excluded.sugar_g,
            sodium_mg = excluded.sodium_mg,
            water_ml = excluded.water_ml,
            confidence = excluded.confidence,
            metadata = excluded.metadata
          returning id
        `,
        [
          body.userId,
          body.externalId ?? null,
          body.consumedAt,
          body.mealType,
          body.source,
          body.description ?? null,
          body.energyKcal ?? null,
          body.proteinG ?? null,
          body.carbsG ?? null,
          body.fatG ?? null,
          body.fiberG ?? null,
          body.sugarG ?? null,
          body.sodiumMg ?? null,
          body.waterMl ?? null,
          body.confidence ?? null,
          JSON.stringify(body.metadata)
        ]
      );

      await recordAuditLog(pool, {
        actorUserId: body.userId,
        action: "bridge.nutrition_meal_entry.created",
        subjectType: "nutrition_meal_entry",
        subjectId: result.rows[0]?.id,
        metadata: { source: body.source, mealType: body.mealType, confidence: body.confidence ?? null }
      });

      return reply.code(201).send({ ok: true, id: result.rows[0]?.id });
    } catch (error) {
      return bridgeError(reply, error);
    }
  });

  app.post("/bridge/v1/training/plan", async (request, reply) => {
    try {
      const principal = await authenticateBridgeRequest(request, pool, config);
      const body = trainingPlanSchema.parse(request.body);
      assertBridgeUser(principal, body.userId);
      await assertOptionalAgentAccess(pool, body.userId, body.agentId);

      const result = await pool.query<{ id: string }>(
        `
          insert into training_plans (
            user_id,
            agent_id,
            external_id,
            title,
            description,
            status,
            source,
            starts_on,
            ends_on,
            metadata
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
          on conflict (user_id, source, external_id)
          where external_id is not null
          do update set
            agent_id = excluded.agent_id,
            title = excluded.title,
            description = excluded.description,
            status = excluded.status,
            starts_on = excluded.starts_on,
            ends_on = excluded.ends_on,
            metadata = excluded.metadata,
            updated_at = now()
          returning id
        `,
        [
          body.userId,
          body.agentId ?? null,
          body.externalId ?? null,
          body.title,
          body.description ?? null,
          body.status,
          body.source,
          body.startsOn ?? null,
          body.endsOn ?? null,
          JSON.stringify(body.metadata)
        ]
      );

      await recordAuditLog(pool, {
        actorUserId: body.userId,
        action: "bridge.training_plan.upserted",
        subjectType: "training_plan",
        subjectId: result.rows[0]?.id,
        metadata: { source: body.source, status: body.status }
      });

      return reply.code(201).send({ ok: true, id: result.rows[0]?.id });
    } catch (error) {
      return bridgeError(reply, error);
    }
  });

  app.get("/bridge/v1/training/plans", async (request, reply) => {
    try {
      const principal = await authenticateBridgeRequest(request, pool, config);
      const query = trainingPlanQuerySchema.parse(request.query);
      assertBridgeUser(principal, query.userId);

      const plans = await listTrainingPlans(pool, query);
      return reply.send({ plans });
    } catch (error) {
      return bridgeError(reply, error);
    }
  });

  app.post("/bridge/v1/training/planned-workout", async (request, reply) => {
    try {
      const principal = await authenticateBridgeRequest(request, pool, config);
      const body = plannedWorkoutSchema.parse(request.body);
      assertBridgeUser(principal, body.userId);
      await assertOptionalAgentAccess(pool, body.userId, body.createdByAgentId);

      const client = await pool.connect();
      try {
        await client.query("begin");
        await assertOptionalTrainingPlanForUser(client, body.userId, body.trainingPlanId);

        const result = await client.query<{ id: string }>(
          `
            insert into planned_workouts (
              user_id,
              training_plan_id,
              created_by_agent_id,
              approval_id,
              external_id,
              title,
              workout_type,
              scheduled_start_at,
              scheduled_end_at,
              status,
              source,
              target_duration_minutes,
              target_energy_kcal,
              notes,
              metadata
            )
            values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::jsonb)
            on conflict (user_id, source, external_id)
            where external_id is not null
            do update set
              training_plan_id = excluded.training_plan_id,
              created_by_agent_id = excluded.created_by_agent_id,
              approval_id = excluded.approval_id,
              title = excluded.title,
              workout_type = excluded.workout_type,
              scheduled_start_at = excluded.scheduled_start_at,
              scheduled_end_at = excluded.scheduled_end_at,
              status = excluded.status,
              target_duration_minutes = excluded.target_duration_minutes,
              target_energy_kcal = excluded.target_energy_kcal,
              notes = excluded.notes,
              metadata = excluded.metadata,
              updated_at = now()
            returning id
          `,
          [
            body.userId,
            body.trainingPlanId ?? null,
            body.createdByAgentId ?? null,
            body.approvalId ?? null,
            body.externalId ?? null,
            body.title,
            body.workoutType,
            body.scheduledStartAt ?? null,
            body.scheduledEndAt ?? null,
            body.status,
            body.source,
            body.targetDurationMinutes ?? null,
            body.targetEnergyKcal ?? null,
            body.notes ?? null,
            JSON.stringify(body.metadata)
          ]
        );

        const plannedWorkoutId = result.rows[0]?.id;
        if (!plannedWorkoutId) {
          throw new Error("planned_workout_not_created");
        }

        await client.query("delete from planned_workout_exercises where planned_workout_id = $1", [plannedWorkoutId]);
        await insertPlannedWorkoutExercises(client, plannedWorkoutId, body.exercises);
        await client.query("commit");

        await recordAuditLog(pool, {
          actorUserId: body.userId,
          action: "bridge.training_planned_workout.upserted",
          subjectType: "planned_workout",
          subjectId: plannedWorkoutId,
          metadata: { source: body.source, workoutType: body.workoutType, exerciseCount: body.exercises.length }
        });

        return reply.code(201).send({ ok: true, id: plannedWorkoutId });
      } catch (error) {
        await client.query("rollback");
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      return bridgeError(reply, error);
    }
  });

  app.post("/bridge/v1/training/performed-workout", async (request, reply) => {
    try {
      const principal = await authenticateBridgeRequest(request, pool, config);
      const body = performedWorkoutSchema.parse(request.body);
      assertBridgeUser(principal, body.userId);

      const client = await pool.connect();
      try {
        await client.query("begin");
        await assertOptionalPlannedWorkoutForUser(client, body.userId, body.plannedWorkoutId);

        const result = await client.query<{ id: string }>(
          `
            insert into performed_workouts (
              user_id,
              planned_workout_id,
              external_id,
              workout_type,
              source,
              source_device,
              started_at,
              ended_at,
              duration_minutes,
              active_energy_kcal,
              total_energy_kcal,
              distance_meters,
              average_heart_rate_bpm,
              max_heart_rate_bpm,
              perceived_effort,
              metadata
            )
            values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16::jsonb)
            on conflict (user_id, source, external_id)
            where external_id is not null
            do update set
              planned_workout_id = excluded.planned_workout_id,
              workout_type = excluded.workout_type,
              source_device = excluded.source_device,
              started_at = excluded.started_at,
              ended_at = excluded.ended_at,
              duration_minutes = excluded.duration_minutes,
              active_energy_kcal = excluded.active_energy_kcal,
              total_energy_kcal = excluded.total_energy_kcal,
              distance_meters = excluded.distance_meters,
              average_heart_rate_bpm = excluded.average_heart_rate_bpm,
              max_heart_rate_bpm = excluded.max_heart_rate_bpm,
              perceived_effort = excluded.perceived_effort,
              metadata = excluded.metadata,
              updated_at = now()
            returning id
          `,
          [
            body.userId,
            body.plannedWorkoutId ?? null,
            body.externalId ?? null,
            body.workoutType,
            body.source,
            body.sourceDevice,
            body.startedAt,
            body.endedAt,
            body.durationMinutes ?? null,
            body.activeEnergyKcal ?? null,
            body.totalEnergyKcal ?? null,
            body.distanceMeters ?? null,
            body.averageHeartRateBpm ?? null,
            body.maxHeartRateBpm ?? null,
            body.perceivedEffort ?? null,
            JSON.stringify(body.metadata)
          ]
        );

        const performedWorkoutId = result.rows[0]?.id;
        if (!performedWorkoutId) {
          throw new Error("performed_workout_not_created");
        }

        await client.query("delete from performed_workout_exercises where performed_workout_id = $1", [performedWorkoutId]);
        await insertPerformedWorkoutExercises(client, performedWorkoutId, body.exercises);

        if (body.plannedWorkoutId) {
          await client.query("update planned_workouts set status = 'completed', updated_at = now() where id = $1", [
            body.plannedWorkoutId
          ]);
        }

        await client.query("commit");

        await recordAuditLog(pool, {
          actorUserId: body.userId,
          action: "bridge.training_performed_workout.upserted",
          subjectType: "performed_workout",
          subjectId: performedWorkoutId,
          metadata: {
            source: body.source,
            sourceDevice: body.sourceDevice,
            workoutType: body.workoutType,
            exerciseCount: body.exercises.length
          }
        });

        return reply.code(201).send({ ok: true, id: performedWorkoutId });
      } catch (error) {
        await client.query("rollback");
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      return bridgeError(reply, error);
    }
  });

  app.get("/bridge/v1/training/planned-workouts", async (request, reply) => {
    try {
      const principal = await authenticateBridgeRequest(request, pool, config);
      const query = trainingWorkoutQuerySchema.parse(request.query);
      assertBridgeUser(principal, query.userId);

      const workouts = await listPlannedWorkouts(pool, query);
      return reply.send({ workouts });
    } catch (error) {
      return bridgeError(reply, error);
    }
  });

  app.get("/bridge/v1/training/performed-workouts", async (request, reply) => {
    try {
      const principal = await authenticateBridgeRequest(request, pool, config);
      const query = trainingWorkoutQuerySchema.parse(request.query);
      assertBridgeUser(principal, query.userId);

      const workouts = await listPerformedWorkouts(pool, query);
      return reply.send({ workouts });
    } catch (error) {
      return bridgeError(reply, error);
    }
  });

  app.get("/bridge/v1/approvals/pending", async (request, reply) => {
    try {
      const principal = await authenticateBridgeRequest(request, pool, config);
      const query = z.object({ userId: z.string().min(1) }).parse(request.query);
      assertBridgeUser(principal, query.userId);

      const result = await pool.query(
        `
          select id, agent_id, action_type, action_payload, requested_by_agent_id, created_at, expires_at
          from approvals
          where status = 'pending'
            and target_user_id = $1
          order by created_at asc
        `,
        [query.userId]
      );

      return reply.send({ approvals: result.rows });
    } catch (error) {
      return bridgeError(reply, error);
    }
  });

  app.post("/bridge/v1/approvals/:id/decision", async (request, reply) => {
    try {
      const principal = await authenticateBridgeRequest(request, pool, config);
      const params = z.object({ id: z.string().uuid() }).parse(request.params);
      const body = approvalDecisionSchema.parse(request.body);
      assertBridgeUser(principal, body.decidedByUserId);

      const result = await pool.query(
        `
          update approvals
          set status = $2,
              decided_by_user_id = $3,
              decision_reason = $4,
              decided_at = now(),
              updated_at = now()
          where id = $1
            and status = 'pending'
            and target_user_id = $5
          returning id, status
        `,
        [params.id, body.decision, body.decidedByUserId, body.reason ?? null, body.decidedByUserId]
      );

      if (!result.rows[0]) {
        return reply.code(404).send({ ok: false, error: "approval_not_found" });
      }

      await recordAuditLog(pool, {
        actorUserId: body.decidedByUserId,
        action: `approval.${body.decision}`,
        subjectType: "approval",
        subjectId: params.id,
        metadata: { reason: body.reason ?? null }
      });

      return reply.send({ ok: true, approval: result.rows[0] });
    } catch (error) {
      return bridgeError(reply, error);
    }
  });
}

type PlannedWorkoutExerciseInput = z.infer<typeof plannedWorkoutExerciseSchema>;
type PlannedWorkoutSetInput = z.infer<typeof plannedWorkoutSetSchema>;
type PerformedWorkoutExerciseInput = z.infer<typeof performedWorkoutExerciseSchema>;
type PerformedWorkoutSetInput = z.infer<typeof performedWorkoutSetSchema>;
type TrainingWorkoutQuery = z.infer<typeof trainingWorkoutQuerySchema>;
type TrainingPlanQuery = z.infer<typeof trainingPlanQuerySchema>;
type Queryable = Pool | PoolClient;

class BridgeRequestError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string
  ) {
    super(code);
  }
}

async function assertOptionalAgentAccess(pool: Pool, userId: string, agentId: string | undefined): Promise<void> {
  if (!agentId) {
    return;
  }

  if (!(await canUseAgent(pool, userId, agentId))) {
    throw new BridgeRequestError(403, "agent_not_allowed");
  }
}

async function assertOptionalTrainingPlanForUser(
  client: Queryable,
  userId: string,
  trainingPlanId: string | undefined
): Promise<void> {
  if (!trainingPlanId) {
    return;
  }

  const result = await client.query("select 1 from training_plans where id = $1 and user_id = $2 limit 1", [
    trainingPlanId,
    userId
  ]);

  if (!result.rows[0]) {
    throw new BridgeRequestError(404, "training_plan_not_found");
  }
}

async function assertOptionalPlannedWorkoutForUser(
  client: Queryable,
  userId: string,
  plannedWorkoutId: string | undefined
): Promise<void> {
  if (!plannedWorkoutId) {
    return;
  }

  const result = await client.query("select 1 from planned_workouts where id = $1 and user_id = $2 limit 1", [
    plannedWorkoutId,
    userId
  ]);

  if (!result.rows[0]) {
    throw new BridgeRequestError(404, "planned_workout_not_found");
  }
}

async function insertPlannedWorkoutExercises(
  client: PoolClient,
  plannedWorkoutId: string,
  exercises: PlannedWorkoutExerciseInput[]
): Promise<void> {
  for (const [exerciseIndex, exercise] of exercises.entries()) {
    const exerciseResult = await client.query<{ id: string }>(
      `
        insert into planned_workout_exercises (
          planned_workout_id,
          exercise_key,
          name,
          order_index,
          notes,
          metadata
        )
        values ($1, $2, $3, $4, $5, $6::jsonb)
        returning id
      `,
      [
        plannedWorkoutId,
        exercise.exerciseKey ?? null,
        exercise.name,
        exercise.orderIndex ?? exerciseIndex,
        exercise.notes ?? null,
        JSON.stringify(exercise.metadata)
      ]
    );

    const plannedExerciseId = exerciseResult.rows[0]?.id;
    if (!plannedExerciseId) {
      throw new Error("planned_workout_exercise_not_created");
    }

    await insertPlannedWorkoutSets(client, plannedExerciseId, exercise.sets);
  }
}

async function insertPlannedWorkoutSets(
  client: PoolClient,
  plannedExerciseId: string,
  sets: PlannedWorkoutSetInput[]
): Promise<void> {
  for (const [setIndex, set] of sets.entries()) {
    await client.query(
      `
        insert into planned_workout_sets (
          planned_exercise_id,
          set_index,
          set_type,
          target_reps_min,
          target_reps_max,
          target_weight_kg,
          target_duration_seconds,
          target_distance_meters,
          target_rpe,
          rest_seconds,
          notes,
          metadata
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb)
      `,
      [
        plannedExerciseId,
        set.setIndex ?? setIndex,
        set.setType,
        set.targetRepsMin ?? null,
        set.targetRepsMax ?? null,
        set.targetWeightKg ?? null,
        set.targetDurationSeconds ?? null,
        set.targetDistanceMeters ?? null,
        set.targetRpe ?? null,
        set.restSeconds ?? null,
        set.notes ?? null,
        JSON.stringify(set.metadata)
      ]
    );
  }
}

async function insertPerformedWorkoutExercises(
  client: PoolClient,
  performedWorkoutId: string,
  exercises: PerformedWorkoutExerciseInput[]
): Promise<void> {
  for (const [exerciseIndex, exercise] of exercises.entries()) {
    const exerciseResult = await client.query<{ id: string }>(
      `
        insert into performed_workout_exercises (
          performed_workout_id,
          exercise_key,
          name,
          order_index,
          notes,
          metadata
        )
        values ($1, $2, $3, $4, $5, $6::jsonb)
        returning id
      `,
      [
        performedWorkoutId,
        exercise.exerciseKey ?? null,
        exercise.name,
        exercise.orderIndex ?? exerciseIndex,
        exercise.notes ?? null,
        JSON.stringify(exercise.metadata)
      ]
    );

    const performedExerciseId = exerciseResult.rows[0]?.id;
    if (!performedExerciseId) {
      throw new Error("performed_workout_exercise_not_created");
    }

    await insertPerformedWorkoutSets(client, performedExerciseId, exercise.sets);
  }
}

async function insertPerformedWorkoutSets(
  client: PoolClient,
  performedExerciseId: string,
  sets: PerformedWorkoutSetInput[]
): Promise<void> {
  for (const [setIndex, set] of sets.entries()) {
    await client.query(
      `
        insert into performed_workout_sets (
          performed_exercise_id,
          set_index,
          set_type,
          status,
          reps,
          weight_kg,
          duration_seconds,
          distance_meters,
          rpe,
          completed_at,
          notes,
          metadata
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb)
      `,
      [
        performedExerciseId,
        set.setIndex ?? setIndex,
        set.setType,
        set.status,
        set.reps ?? null,
        set.weightKg ?? null,
        set.durationSeconds ?? null,
        set.distanceMeters ?? null,
        set.rpe ?? null,
        set.completedAt ?? null,
        set.notes ?? null,
        JSON.stringify(set.metadata)
      ]
    );
  }
}

type TrainingPlanRow = {
  id: string;
  user_id: string;
  agent_id: string | null;
  external_id: string | null;
  title: string;
  description: string | null;
  status: string;
  source: string;
  starts_on: string | null;
  ends_on: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
};

type PlannedWorkoutRow = {
  id: string;
  user_id: string;
  training_plan_id: string | null;
  created_by_agent_id: string | null;
  approval_id: string | null;
  external_id: string | null;
  title: string;
  workout_type: string;
  scheduled_start_at: Date | null;
  scheduled_end_at: Date | null;
  status: string;
  source: string;
  target_duration_minutes: string | null;
  target_energy_kcal: string | null;
  notes: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
};

type PlannedExerciseRow = {
  id: string;
  planned_workout_id: string;
  exercise_key: string | null;
  name: string;
  order_index: number;
  notes: string | null;
  metadata: Record<string, unknown>;
};

type PlannedSetRow = {
  id: string;
  planned_exercise_id: string;
  set_index: number;
  set_type: string;
  target_reps_min: number | null;
  target_reps_max: number | null;
  target_weight_kg: string | null;
  target_duration_seconds: number | null;
  target_distance_meters: string | null;
  target_rpe: string | null;
  rest_seconds: number | null;
  notes: string | null;
  metadata: Record<string, unknown>;
};

type PerformedWorkoutRow = {
  id: string;
  user_id: string;
  planned_workout_id: string | null;
  external_id: string | null;
  workout_type: string;
  source: string;
  source_device: string;
  started_at: Date;
  ended_at: Date;
  duration_minutes: string | null;
  active_energy_kcal: string | null;
  total_energy_kcal: string | null;
  distance_meters: string | null;
  average_heart_rate_bpm: string | null;
  max_heart_rate_bpm: string | null;
  perceived_effort: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
};

type PerformedExerciseRow = {
  id: string;
  performed_workout_id: string;
  exercise_key: string | null;
  name: string;
  order_index: number;
  notes: string | null;
  metadata: Record<string, unknown>;
};

type PerformedSetRow = {
  id: string;
  performed_exercise_id: string;
  set_index: number;
  set_type: string;
  status: string;
  reps: number | null;
  weight_kg: string | null;
  duration_seconds: number | null;
  distance_meters: string | null;
  rpe: string | null;
  completed_at: Date | null;
  notes: string | null;
  metadata: Record<string, unknown>;
};

async function listTrainingPlans(pool: Pool, query: TrainingPlanQuery): Promise<unknown[]> {
  const result = await pool.query<TrainingPlanRow>(
    `
      select id, user_id, agent_id, external_id, title, description, status, source, starts_on, ends_on,
             metadata, created_at, updated_at
      from training_plans
      where user_id = $1
        and ($2::text is null or status = $2)
      order by created_at desc
      limit $3
    `,
    [query.userId, query.status ?? null, query.limit]
  );

  return result.rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    agentId: row.agent_id,
    externalId: row.external_id,
    title: row.title,
    description: row.description,
    status: row.status,
    source: row.source,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    metadata: row.metadata,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  }));
}

async function listPlannedWorkouts(pool: Pool, query: TrainingWorkoutQuery): Promise<unknown[]> {
  const result = await pool.query<PlannedWorkoutRow>(
    `
      select id, user_id, training_plan_id, created_by_agent_id, approval_id, external_id, title, workout_type,
             scheduled_start_at, scheduled_end_at, status, source, target_duration_minutes, target_energy_kcal,
             notes, metadata, created_at, updated_at
      from planned_workouts
      where user_id = $1
        and ($2::timestamptz is null or scheduled_start_at >= $2::timestamptz)
        and ($3::timestamptz is null or scheduled_start_at < $3::timestamptz)
      order by scheduled_start_at desc nulls last, created_at desc
      limit $4
    `,
    [query.userId, query.from ?? null, query.to ?? null, query.limit]
  );

  const exercisesByWorkoutId = await loadPlannedExercises(pool, result.rows.map((row) => row.id));
  return result.rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    trainingPlanId: row.training_plan_id,
    createdByAgentId: row.created_by_agent_id,
    approvalId: row.approval_id,
    externalId: row.external_id,
    title: row.title,
    workoutType: row.workout_type,
    scheduledStartAt: toIso(row.scheduled_start_at),
    scheduledEndAt: toIso(row.scheduled_end_at),
    status: row.status,
    source: row.source,
    targetDurationMinutes: toNumber(row.target_duration_minutes),
    targetEnergyKcal: toNumber(row.target_energy_kcal),
    notes: row.notes,
    metadata: row.metadata,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    exercises: exercisesByWorkoutId.get(row.id) ?? []
  }));
}

async function loadPlannedExercises(pool: Pool, workoutIds: string[]): Promise<Map<string, unknown[]>> {
  const exercisesByWorkoutId = new Map<string, unknown[]>();
  if (workoutIds.length === 0) {
    return exercisesByWorkoutId;
  }

  const exerciseResult = await pool.query<PlannedExerciseRow>(
    `
      select id, planned_workout_id, exercise_key, name, order_index, notes, metadata
      from planned_workout_exercises
      where planned_workout_id = any($1::uuid[])
      order by planned_workout_id, order_index asc
    `,
    [workoutIds]
  );
  const exerciseIds = exerciseResult.rows.map((row) => row.id);
  const setsByExerciseId = await loadPlannedSets(pool, exerciseIds);

  for (const row of exerciseResult.rows) {
    const exercises = exercisesByWorkoutId.get(row.planned_workout_id) ?? [];
    exercises.push({
      id: row.id,
      exerciseKey: row.exercise_key,
      name: row.name,
      orderIndex: row.order_index,
      notes: row.notes,
      metadata: row.metadata,
      sets: setsByExerciseId.get(row.id) ?? []
    });
    exercisesByWorkoutId.set(row.planned_workout_id, exercises);
  }

  return exercisesByWorkoutId;
}

async function loadPlannedSets(pool: Pool, exerciseIds: string[]): Promise<Map<string, unknown[]>> {
  const setsByExerciseId = new Map<string, unknown[]>();
  if (exerciseIds.length === 0) {
    return setsByExerciseId;
  }

  const setResult = await pool.query<PlannedSetRow>(
    `
      select id, planned_exercise_id, set_index, set_type, target_reps_min, target_reps_max, target_weight_kg,
             target_duration_seconds, target_distance_meters, target_rpe, rest_seconds, notes, metadata
      from planned_workout_sets
      where planned_exercise_id = any($1::uuid[])
      order by planned_exercise_id, set_index asc
    `,
    [exerciseIds]
  );

  for (const row of setResult.rows) {
    const sets = setsByExerciseId.get(row.planned_exercise_id) ?? [];
    sets.push({
      id: row.id,
      setIndex: row.set_index,
      setType: row.set_type,
      targetRepsMin: row.target_reps_min,
      targetRepsMax: row.target_reps_max,
      targetWeightKg: toNumber(row.target_weight_kg),
      targetDurationSeconds: row.target_duration_seconds,
      targetDistanceMeters: toNumber(row.target_distance_meters),
      targetRpe: toNumber(row.target_rpe),
      restSeconds: row.rest_seconds,
      notes: row.notes,
      metadata: row.metadata
    });
    setsByExerciseId.set(row.planned_exercise_id, sets);
  }

  return setsByExerciseId;
}

async function listPerformedWorkouts(pool: Pool, query: TrainingWorkoutQuery): Promise<unknown[]> {
  const result = await pool.query<PerformedWorkoutRow>(
    `
      select id, user_id, planned_workout_id, external_id, workout_type, source, source_device, started_at, ended_at,
             duration_minutes, active_energy_kcal, total_energy_kcal, distance_meters, average_heart_rate_bpm,
             max_heart_rate_bpm, perceived_effort, metadata, created_at, updated_at
      from performed_workouts
      where user_id = $1
        and ($2::timestamptz is null or started_at >= $2::timestamptz)
        and ($3::timestamptz is null or started_at < $3::timestamptz)
      order by started_at desc
      limit $4
    `,
    [query.userId, query.from ?? null, query.to ?? null, query.limit]
  );

  const exercisesByWorkoutId = await loadPerformedExercises(pool, result.rows.map((row) => row.id));
  return result.rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    plannedWorkoutId: row.planned_workout_id,
    externalId: row.external_id,
    workoutType: row.workout_type,
    source: row.source,
    sourceDevice: row.source_device,
    startedAt: toIso(row.started_at),
    endedAt: toIso(row.ended_at),
    durationMinutes: toNumber(row.duration_minutes),
    activeEnergyKcal: toNumber(row.active_energy_kcal),
    totalEnergyKcal: toNumber(row.total_energy_kcal),
    distanceMeters: toNumber(row.distance_meters),
    averageHeartRateBpm: toNumber(row.average_heart_rate_bpm),
    maxHeartRateBpm: toNumber(row.max_heart_rate_bpm),
    perceivedEffort: toNumber(row.perceived_effort),
    metadata: row.metadata,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    exercises: exercisesByWorkoutId.get(row.id) ?? []
  }));
}

async function loadPerformedExercises(pool: Pool, workoutIds: string[]): Promise<Map<string, unknown[]>> {
  const exercisesByWorkoutId = new Map<string, unknown[]>();
  if (workoutIds.length === 0) {
    return exercisesByWorkoutId;
  }

  const exerciseResult = await pool.query<PerformedExerciseRow>(
    `
      select id, performed_workout_id, exercise_key, name, order_index, notes, metadata
      from performed_workout_exercises
      where performed_workout_id = any($1::uuid[])
      order by performed_workout_id, order_index asc
    `,
    [workoutIds]
  );
  const exerciseIds = exerciseResult.rows.map((row) => row.id);
  const setsByExerciseId = await loadPerformedSets(pool, exerciseIds);

  for (const row of exerciseResult.rows) {
    const exercises = exercisesByWorkoutId.get(row.performed_workout_id) ?? [];
    exercises.push({
      id: row.id,
      exerciseKey: row.exercise_key,
      name: row.name,
      orderIndex: row.order_index,
      notes: row.notes,
      metadata: row.metadata,
      sets: setsByExerciseId.get(row.id) ?? []
    });
    exercisesByWorkoutId.set(row.performed_workout_id, exercises);
  }

  return exercisesByWorkoutId;
}

async function loadPerformedSets(pool: Pool, exerciseIds: string[]): Promise<Map<string, unknown[]>> {
  const setsByExerciseId = new Map<string, unknown[]>();
  if (exerciseIds.length === 0) {
    return setsByExerciseId;
  }

  const setResult = await pool.query<PerformedSetRow>(
    `
      select id, performed_exercise_id, set_index, set_type, status, reps, weight_kg, duration_seconds,
             distance_meters, rpe, completed_at, notes, metadata
      from performed_workout_sets
      where performed_exercise_id = any($1::uuid[])
      order by performed_exercise_id, set_index asc
    `,
    [exerciseIds]
  );

  for (const row of setResult.rows) {
    const sets = setsByExerciseId.get(row.performed_exercise_id) ?? [];
    sets.push({
      id: row.id,
      setIndex: row.set_index,
      setType: row.set_type,
      status: row.status,
      reps: row.reps,
      weightKg: toNumber(row.weight_kg),
      durationSeconds: row.duration_seconds,
      distanceMeters: toNumber(row.distance_meters),
      rpe: toNumber(row.rpe),
      completedAt: toIso(row.completed_at),
      notes: row.notes,
      metadata: row.metadata
    });
    setsByExerciseId.set(row.performed_exercise_id, sets);
  }

  return setsByExerciseId;
}

function toIso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function toNumber(value: string | number | null): number | null {
  if (value === null) {
    return null;
  }

  return typeof value === "number" ? value : Number(value);
}

function bridgeError(reply: { code: (status: number) => { send: (body: unknown) => unknown } }, error: unknown): unknown {
  if (error instanceof BridgeRequestError) {
    return reply.code(error.statusCode).send({ ok: false, error: error.code });
  }

  if (error instanceof BridgeAuthError) {
    return reply.code(401).send({ ok: false, error: "unauthorized" });
  }

  if (error instanceof z.ZodError) {
    return reply.code(400).send({ ok: false, error: "invalid_request", details: error.issues });
  }

  throw error;
}
