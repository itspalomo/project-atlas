import { Pool } from "pg";
import { AtlasConfig } from "../config.js";
import { recordAuditLog } from "../audit/auditLog.js";
import { buildDeterministicContext, DeterministicContext } from "./deterministicContext.js";

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

  const agent = await getAgentRuntimeConfig(pool, input.agentId);
  const endpoint = getHermesEndpoint(config, agent);

  if (!endpoint) {
    await recordAuditLog(pool, {
      actorUserId: input.userId,
      action: "runtime.hermes.missing_endpoint",
      subjectType: "agent",
      subjectId: input.agentId,
      metadata: { channel: input.channel }
    });

    return {
      runtime: "stub",
      text: "Atlas cannot reach this Hermes profile yet."
    };
  }

  const deterministicContext = await safeBuildDeterministicContext(pool, input, agent);
  const messages = [
    ...(deterministicContext.content
      ? [
          {
            role: "system",
            content: deterministicContext.content
          }
        ]
      : []),
    {
      role: "user",
      content: input.text
    }
  ];

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: config.hermesModel,
      messages,
      metadata: {
        atlas_user_id: input.userId,
        atlas_agent_id: input.agentId,
        atlas_hermes_profile: agent.hermesProfile,
        atlas_honcho_workspace: agent.honchoWorkspace,
        atlas_skills: agent.skills,
        atlas_context_sections: deterministicContext.sections,
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

async function safeBuildDeterministicContext(
  pool: Pool,
  input: AgentReplyInput,
  agent: AgentRuntimeConfig
): Promise<DeterministicContext> {
  try {
    return await buildDeterministicContext(pool, {
      userId: input.userId,
      agentId: input.agentId,
      skills: agent.skills
    });
  } catch (error) {
    await recordAuditLog(pool, {
      actorUserId: input.userId,
      action: "runtime.context.build_failed",
      subjectType: "agent",
      subjectId: input.agentId,
      metadata: { error: error instanceof Error ? error.message : String(error) }
    });

    return { content: "", sections: [] };
  }
}

type AgentRuntimeConfig = {
  id: string;
  hermesProfile: string;
  honchoWorkspace: string;
  skills: string[];
  runtimeUrl?: string;
};

async function getAgentRuntimeConfig(pool: Pool, agentId: string): Promise<AgentRuntimeConfig> {
  const result = await pool.query<{
    id: string;
    hermes_profile: string;
    honcho_workspace: string;
    config: {
      skills?: unknown;
      runtime?: {
        url?: string;
      };
    };
  }>(
    `
      select id, hermes_profile, honcho_workspace, config
      from agents
      where id = $1
      limit 1
    `,
    [agentId]
  );

  const row = result.rows[0];
  if (!row) {
    return {
      id: agentId,
      hermesProfile: agentId,
      honchoWorkspace: agentId,
      skills: []
    };
  }

  return {
    id: row.id,
    hermesProfile: row.hermes_profile,
    honchoWorkspace: row.honcho_workspace,
    skills: Array.isArray(row.config.skills)
      ? row.config.skills.filter((skill): skill is string => typeof skill === "string")
      : [],
    runtimeUrl: row.config.runtime?.url
  };
}

function getHermesEndpoint(config: AtlasConfig, agent: AgentRuntimeConfig): string | undefined {
  const rawEndpoint =
    agent.runtimeUrl ??
    config.hermesEndpointTemplate
      ?.replaceAll("{profile}", encodeURIComponent(agent.hermesProfile))
      .replaceAll("{agentId}", encodeURIComponent(agent.id));

  if (rawEndpoint) {
    return rawEndpoint.endsWith("/v1/chat/completions")
      ? rawEndpoint
      : `${rawEndpoint.replace(/\/$/, "")}/v1/chat/completions`;
  }

  if (!config.hermesBaseUrl) {
    return undefined;
  }

  return `${config.hermesBaseUrl.replace(/\/$/, "")}/v1/chat/completions`;
}
