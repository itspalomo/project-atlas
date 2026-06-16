import { Pool } from "pg";
import { normalizePhoneNumber } from "./phone.js";

export type ChannelIdentity = {
  userId: string;
  agentId: string;
  channelId: string;
};

export async function findWhatsAppIdentity(pool: Pool, phoneNumber: string): Promise<ChannelIdentity | undefined> {
  const normalized = normalizePhoneNumber(phoneNumber);
  const result = await pool.query<{
    id: string;
    user_id: string;
    agent_id: string;
  }>(
    `
      select id, user_id, agent_id
      from identity_channels
      where channel = 'whatsapp'
        and external_id = $1
        and is_enabled = true
      limit 1
    `,
    [normalized]
  );

  const row = result.rows[0];
  if (!row) {
    return undefined;
  }

  return {
    channelId: row.id,
    userId: row.user_id,
    agentId: row.agent_id
  };
}

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
