import fastify, { FastifyInstance } from "fastify";
import { Pool } from "pg";
import { AtlasConfig } from "./config.js";
import { registerBridgeRoutes } from "./bridge/routes.js";
import { registerMcpRoutes } from "./mcp/routes.js";
import { builtInSkills, skillManifestForIds } from "./skills/skillCatalog.js";

export async function buildServer(config: AtlasConfig, pool: Pool): Promise<FastifyInstance> {
  const app = fastify({
    logger: {
      level: config.logLevel
    },
    bodyLimit: 1024 * 1024
  });

  app.get("/health", async () => ({
    ok: true,
    service: "atlas-api",
    mcpConfigured: Boolean(config.mcp.key),
    honchoConfigured: Boolean(config.honcho?.baseUrl)
  }));

  app.get("/ready", async (_request, reply) => {
    try {
      await pool.query("select 1");

      return {
        ok: true,
        service: "atlas-api",
        database: "connected"
      };
    } catch {
      return reply.code(503).send({
        ok: false,
        service: "atlas-api",
        database: "unavailable"
      });
    }
  });

  app.get("/capabilities", async () => ({
    capabilities: skillManifestForIds(builtInSkills.map((skill) => skill.id))
  }));

  app.get("/skills", async () => ({
    capabilities: skillManifestForIds(builtInSkills.map((skill) => skill.id)),
    note: "Compatibility alias. Atlas capabilities generate native Hermes skills."
  }));

  await registerMcpRoutes(app, pool, config);
  await registerBridgeRoutes(app, pool, config);

  return app;
}
