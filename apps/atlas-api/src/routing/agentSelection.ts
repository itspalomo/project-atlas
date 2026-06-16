import { Pool } from "pg";
import { canUseAgent } from "../identity/identityService.js";

export async function selectAgentForMessage(
  pool: Pool,
  userId: string,
  defaultAgentId: string,
  text: string
): Promise<{ agentId: string; cleanedText: string }> {
  const trimmed = text.trim();
  const sharedRoute = await findSharedRoute(pool, userId, trimmed);

  if (!sharedRoute) {
    return { agentId: defaultAgentId, cleanedText: trimmed };
  }

  const allowed = await canUseAgent(pool, userId, sharedRoute.agentId);
  if (!allowed) {
    return { agentId: defaultAgentId, cleanedText: trimmed };
  }

  return {
    agentId: sharedRoute.agentId,
    cleanedText: trimmed.slice(sharedRoute.alias.length).trim() || trimmed
  };
}

async function findSharedRoute(
  pool: Pool,
  userId: string,
  text: string
): Promise<{ agentId: string; alias: string } | undefined> {
  const result = await pool.query<{
    id: string;
    config: {
      routingAliases?: string[];
    };
  }>(
    `
      select agents.id, agents.config
      from agents
      join agent_memberships on agent_memberships.agent_id = agents.id
      where agent_memberships.user_id = $1
      order by agents.id asc
    `,
    [userId]
  );

  const lowered = text.toLowerCase();

  for (const row of result.rows) {
    for (const alias of row.config.routingAliases ?? []) {
      if (lowered.startsWith(alias.toLowerCase())) {
        return { agentId: row.id, alias };
      }
    }
  }

  return undefined;
}
