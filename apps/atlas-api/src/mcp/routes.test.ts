import fastify from "fastify";
import { describe, expect, it } from "vitest";
import { Pool } from "pg";
import { AtlasConfig } from "../config.js";
import { registerMcpRoutes } from "./routes.js";

describe("Atlas MCP routes", () => {
  it("requires the MCP bearer token in production", async () => {
    const app = fastify();
    await registerMcpRoutes(app, fakePool({ capabilities: ["health"] }), config({ nodeEnv: "production", mcpKey: "secret" }));

    const response = await app.inject({
      method: "POST",
      url: "/mcp",
      payload: {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list"
      }
    });

    expect(response.statusCode).toBe(401);
  });

  it("exposes the Atlas context tool through MCP tools/list", async () => {
    const app = fastify();
    await registerMcpRoutes(app, fakePool(), config({ nodeEnv: "production", mcpKey: "secret" }));

    const response = await app.inject({
      method: "POST",
      url: "/mcp",
      headers: {
        authorization: "Bearer secret"
      },
      payload: {
        jsonrpc: "2.0",
        id: "tools",
        method: "tools/list"
      }
    });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(body.result.tools[0].name).toBe("atlas_get_context");
  });

  it("returns scoped deterministic context for an authorized user and agent", async () => {
    const app = fastify();
    await registerMcpRoutes(app, fakePool({ capabilities: ["health"] }), config({ nodeEnv: "production", mcpKey: "secret" }));

    const response = await app.inject({
      method: "POST",
      url: "/mcp",
      headers: {
        authorization: "Bearer secret"
      },
      payload: {
        jsonrpc: "2.0",
        id: "call",
        method: "tools/call",
        params: {
          name: "atlas_get_context",
          arguments: {
            userId: "user-one",
            agentId: "household",
            capabilities: []
          }
        }
      }
    });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(body.result.isError).toBe(false);
    expect(body.result.structuredContent.capabilities).toEqual(["health"]);
    expect(body.result.content[0].text).toContain("no deterministic structured context");
  });

  it("rejects capabilities that are not enabled for the agent", async () => {
    const app = fastify();
    await registerMcpRoutes(app, fakePool({ capabilities: ["health"] }), config({ nodeEnv: "production", mcpKey: "secret" }));

    const response = await app.inject({
      method: "POST",
      url: "/mcp",
      headers: {
        authorization: "Bearer secret"
      },
      payload: {
        jsonrpc: "2.0",
        id: "call",
        method: "tools/call",
        params: {
          name: "atlas_get_context",
          arguments: {
            userId: "user-one",
            agentId: "household",
            capabilities: ["training"]
          }
        }
      }
    });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(body.result.isError).toBe(true);
    expect(body.result.content[0].text).toContain("not enabled");
  });
});

function config(overrides: { nodeEnv: string; mcpKey?: string }): AtlasConfig {
  return {
    nodeEnv: overrides.nodeEnv,
    logLevel: "silent",
    host: "0.0.0.0",
    port: 3000,
    databaseUrl: "postgres://atlas:atlas@localhost:5432/atlas",
    ecosystemConfigPath: "ecosystem/atlas.yaml",
    whatsapp: {
      graphApiVersion: "v24.0",
      verifyToken: "verify",
      requestTimeoutMs: 10_000,
      sendUnauthorizedReply: false
    },
    legacyWhatsappWebhookEnabled: false,
    mcp: {
      url: "http://atlas-api:3000/mcp",
      key: overrides.mcpKey
    },
    runtimeMode: "stub",
    hermesModel: "hermes",
    honcho: {}
  };
}

function fakePool(options: { capabilities?: string[] } = {}): Pool {
  return {
    query: async (query: unknown) => {
      const sql = String(query);
      if (sql.includes("from agent_memberships")) {
        return { rows: [{ "?column?": 1 }], rowCount: 1 };
      }

      if (sql.includes("from agents")) {
        return { rows: [{ config: { skills: options.capabilities ?? [] } }], rowCount: 1 };
      }

      return { rows: [], rowCount: 0 };
    }
  } as unknown as Pool;
}
