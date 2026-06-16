import { Pool } from "pg";
import { canUseAgent } from "../identity/identityService.js";

const familyPrefixes = ["/family", "family:", "@family"];

export async function selectAgentForMessage(
  pool: Pool,
  userId: string,
  defaultAgentId: string,
  text: string
): Promise<{ agentId: string; cleanedText: string }> {
  const trimmed = text.trim();
  const matchingPrefix = familyPrefixes.find((prefix) => trimmed.toLowerCase().startsWith(prefix));

  if (!matchingPrefix) {
    return { agentId: defaultAgentId, cleanedText: trimmed };
  }

  const allowed = await canUseAgent(pool, userId, "atlas-family");
  if (!allowed) {
    return { agentId: defaultAgentId, cleanedText: trimmed };
  }

  return {
    agentId: "atlas-family",
    cleanedText: trimmed.slice(matchingPrefix.length).trim() || trimmed
  };
}
