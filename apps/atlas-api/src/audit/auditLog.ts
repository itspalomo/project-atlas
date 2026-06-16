import { Pool } from "pg";

export type AuditLogInput = {
  actorUserId?: string;
  action: string;
  subjectType?: string;
  subjectId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
};

export async function recordAuditLog(pool: Pool, input: AuditLogInput): Promise<void> {
  await pool.query(
    `
      insert into audit_logs (
        actor_user_id,
        action,
        subject_type,
        subject_id,
        metadata,
        ip_address,
        user_agent
      )
      values ($1, $2, $3, $4, $5::jsonb, $6, $7)
    `,
    [
      input.actorUserId ?? null,
      input.action,
      input.subjectType ?? null,
      input.subjectId ?? null,
      JSON.stringify(input.metadata ?? {}),
      input.ipAddress ?? null,
      input.userAgent ?? null
    ]
  );
}
