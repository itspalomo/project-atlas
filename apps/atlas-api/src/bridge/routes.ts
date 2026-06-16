import { FastifyInstance } from "fastify";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { Pool } from "pg";
import { AtlasConfig } from "../config.js";
import {
  assertBridgeBootstrap,
  assertBridgeUser,
  authenticateBridgeRequest,
  BridgeAuthError,
  hashBridgeToken
} from "./bridgeAuth.js";
import { recordAuditLog } from "../audit/auditLog.js";

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

function bridgeError(reply: { code: (status: number) => { send: (body: unknown) => unknown } }, error: unknown): unknown {
  if (error instanceof BridgeAuthError) {
    return reply.code(401).send({ ok: false, error: "unauthorized" });
  }

  if (error instanceof z.ZodError) {
    return reply.code(400).send({ ok: false, error: "invalid_request", details: error.issues });
  }

  throw error;
}
