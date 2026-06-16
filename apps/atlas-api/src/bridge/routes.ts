import { FastifyInstance } from "fastify";
import { z } from "zod";
import { Pool } from "pg";
import { AtlasConfig } from "../config.js";
import { authenticateBridgeRequest, BridgeAuthError } from "./bridgeAuth.js";
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
  app.post("/bridge/v1/health/daily-summary", async (request, reply) => {
    try {
      await authenticateBridgeRequest(request, pool, config);
      const body = healthSummarySchema.parse(request.body);

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
      await authenticateBridgeRequest(request, pool, config);
      const body = calendarBusyBlocksSchema.parse(request.body);

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
      await authenticateBridgeRequest(request, pool, config);
      const body = locationSignalSchema.parse(request.body);

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

  app.get("/bridge/v1/approvals/pending", async (request, reply) => {
    try {
      await authenticateBridgeRequest(request, pool, config);
      const query = z.object({ userId: z.string().min(1) }).parse(request.query);

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
      await authenticateBridgeRequest(request, pool, config);
      const params = z.object({ id: z.string().uuid() }).parse(request.params);
      const body = approvalDecisionSchema.parse(request.body);

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
          returning id, status
        `,
        [params.id, body.decision, body.decidedByUserId, body.reason ?? null]
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
