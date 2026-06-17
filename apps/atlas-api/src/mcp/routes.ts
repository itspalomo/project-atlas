import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { Pool } from "pg";
import { z } from "zod";
import { AtlasConfig } from "../config.js";
import { buildDeterministicContext } from "../agents/deterministicContext.js";
import { canUseAgent } from "../identity/identityService.js";

const jsonRpcRequestSchema = z.object({
  jsonrpc: z.literal("2.0").optional(),
  id: z.union([z.string(), z.number(), z.null()]).optional(),
  method: z.string().min(1),
  params: z.unknown().optional()
});

const atlasContextArgsSchema = z.object({
  userId: z.string().min(1),
  agentId: z.string().min(1),
  capabilities: z.array(z.string().min(1)).default([])
});

type JsonRpcId = string | number | null | undefined;

export async function registerMcpRoutes(app: FastifyInstance, pool: Pool, config: AtlasConfig): Promise<void> {
  app.post("/mcp", async (request, reply) => {
    if (!authorizeMcpRequest(request, config)) {
      return reply.code(401).send({ error: "unauthorized" });
    }

    const parsed = jsonRpcRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send(jsonRpcError(null, -32600, "Invalid Request"));
    }

    const rpc = parsed.data;
    if (rpc.id === undefined) {
      await handleMcpNotification(reply);
      return;
    }

    switch (rpc.method) {
      case "initialize":
        return reply.send(
          jsonRpcResult(rpc.id, {
            protocolVersion: "2024-11-05",
            capabilities: {
              tools: {}
            },
            serverInfo: {
              name: "project-atlas",
              version: "0.1.0"
            }
          })
        );

      case "ping":
        return reply.send(jsonRpcResult(rpc.id, {}));

      case "tools/list":
        return reply.send(
          jsonRpcResult(rpc.id, {
            tools: [atlasGetContextTool()]
          })
        );

      case "tools/call":
        return handleToolCall(reply, pool, rpc.id, rpc.params);

      default:
        return reply.send(jsonRpcError(rpc.id, -32601, `Unknown MCP method: ${rpc.method}`));
    }
  });
}

function authorizeMcpRequest(request: FastifyRequest, config: AtlasConfig): boolean {
  if (!config.mcp.key) {
    return config.nodeEnv !== "production";
  }

  const header = request.headers.authorization;
  return header === `Bearer ${config.mcp.key}`;
}

async function handleMcpNotification(reply: FastifyReply): Promise<void> {
  return reply.code(202).send();
}

async function handleToolCall(reply: FastifyReply, pool: Pool, id: JsonRpcId, params: unknown): Promise<void> {
  const parsed = z
    .object({
      name: z.string().min(1),
      arguments: z.unknown().optional()
    })
    .safeParse(params);

  if (!parsed.success) {
    return reply.send(jsonRpcError(id, -32602, "Invalid tool call params"));
  }

  if (parsed.data.name !== "atlas_get_context") {
    return reply.send(jsonRpcError(id, -32602, `Unknown Atlas tool: ${parsed.data.name}`));
  }

  const args = atlasContextArgsSchema.safeParse(parsed.data.arguments ?? {});
  if (!args.success) {
    return reply.send(jsonRpcToolError(id, z.prettifyError(args.error)));
  }

  const allowed = await canUseAgent(pool, args.data.userId, args.data.agentId);
  if (!allowed) {
    return reply.send(jsonRpcToolError(id, "The requested user is not allowed to use that agent."));
  }

  const enabledCapabilities = await loadAgentCapabilities(pool, args.data.agentId);
  const requestedCapabilities = args.data.capabilities.length > 0 ? args.data.capabilities : enabledCapabilities;
  const disallowedCapabilities = requestedCapabilities.filter((capability) => !enabledCapabilities.includes(capability));
  if (disallowedCapabilities.length > 0) {
    return reply.send(
      jsonRpcToolError(
        id,
        `The requested capability is not enabled for this agent: ${disallowedCapabilities.join(", ")}.`
      )
    );
  }

  const context = await buildDeterministicContext(pool, {
    userId: args.data.userId,
    agentId: args.data.agentId,
    skills: requestedCapabilities
  });

  return reply.send(
    jsonRpcResult(id, {
      content: [
        {
          type: "text",
          text:
            context.content ||
            "Atlas has no deterministic structured context for that user, agent, and capability set yet."
        }
      ],
      structuredContent: {
        capabilities: requestedCapabilities,
        sections: context.sections
      },
      isError: false
    })
  );
}

async function loadAgentCapabilities(pool: Pool, agentId: string): Promise<string[]> {
  const result = await pool.query<{
    config: {
      skills?: unknown;
    };
  }>(
    `
      select config
      from agents
      where id = $1
      limit 1
    `,
    [agentId]
  );
  const skills = result.rows[0]?.config.skills;

  return Array.isArray(skills) ? skills.filter((skill): skill is string => typeof skill === "string") : [];
}

function atlasGetContextTool(): Record<string, unknown> {
  return {
    name: "atlas_get_context",
    description:
      "Read Atlas deterministic structured context for an authorized user and agent. Use this for custom iOS bridge data such as training, nutrition, health summaries, calendar availability, reminders, and semantic location.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        userId: {
          type: "string",
          description: "Atlas user id from the installed ecosystem config."
        },
        agentId: {
          type: "string",
          description: "Atlas agent id from the installed ecosystem config."
        },
        capabilities: {
          type: "array",
          items: { type: "string" },
          description: "Atlas capability ids relevant to this request, such as training, nutrition, health, calendar, reminders, or location."
        }
      },
      required: ["userId", "agentId"]
    }
  };
}

function jsonRpcResult(id: JsonRpcId, result: unknown): Record<string, unknown> {
  return {
    jsonrpc: "2.0",
    id: id ?? null,
    result
  };
}

function jsonRpcError(id: JsonRpcId, code: number, message: string): Record<string, unknown> {
  return {
    jsonrpc: "2.0",
    id: id ?? null,
    error: {
      code,
      message
    }
  };
}

function jsonRpcToolError(id: JsonRpcId, text: string): Record<string, unknown> {
  return jsonRpcResult(id, {
    content: [
      {
        type: "text",
        text
      }
    ],
    isError: true
  });
}
