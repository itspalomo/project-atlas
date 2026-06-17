import { Pool } from "pg";

export async function canUseAgent(pool: Pool, userId: string, agentId: string): Promise<boolean> {
  const result = await pool.query(
    `
      select 1
      from agent_memberships
      where user_id = $1
        and agent_id = $2
      limit 1
    `,
    [userId, agentId]
  );

  return Boolean(result.rowCount);
}
