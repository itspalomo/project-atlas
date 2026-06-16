import { Pool } from "pg";
import { AtlasConfig } from "../config.js";
import { recordAuditLog } from "../audit/auditLog.js";

export type AgentReplyInput = {
  agentId: string;
  userId: string;
  text: string;
  channel: "whatsapp" | "ios_bridge";
  conversationId: string;
};

export type AgentReply = {
  text: string;
  runtime: "stub" | "hermes";
};

const profileEnvNames: Record<string, keyof AtlasConfig["hermesProfileUrls"]> = {
  "atlas-jose": "atlasJose",
  "atlas-wife": "atlasWife",
  "atlas-family": "atlasFamily"
};

export async function generateAgentReply(
  pool: Pool,
  config: AtlasConfig,
  input: AgentReplyInput
): Promise<AgentReply> {
  if (config.runtimeMode !== "hermes") {
    return {
      runtime: "stub",
      text: `Atlas received your message for ${input.agentId}. Hermes routing is not enabled yet.`
    };
  }

  const profileKey = profileEnvNames[input.agentId];
  const baseUrl = profileKey ? config.hermesProfileUrls[profileKey] : undefined;

  if (!baseUrl) {
    await recordAuditLog(pool, {
      actorUserId: input.userId,
      action: "runtime.hermes.missing_profile_url",
      subjectType: "agent",
      subjectId: input.agentId,
      metadata: { channel: input.channel }
    });

    return {
      runtime: "stub",
      text: "Atlas cannot reach this Hermes profile yet."
    };
  }

  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: config.hermesModel,
      messages: [
        {
          role: "user",
          content: input.text
        }
      ],
      metadata: {
        atlas_user_id: input.userId,
        atlas_agent_id: input.agentId,
        atlas_conversation_id: input.conversationId,
        atlas_channel: input.channel
      }
    })
  });

  if (!response.ok) {
    await recordAuditLog(pool, {
      actorUserId: input.userId,
      action: "runtime.hermes.request_failed",
      subjectType: "agent",
      subjectId: input.agentId,
      metadata: { status: response.status, statusText: response.statusText }
    });

    return {
      runtime: "stub",
      text: "Atlas reached Hermes, but the runtime did not return a usable response."
    };
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  return {
    runtime: "hermes",
    text: payload.choices?.[0]?.message?.content?.trim() || "Hermes returned an empty response."
  };
}
