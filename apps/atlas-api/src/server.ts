import fastify, { FastifyInstance } from "fastify";
import { Pool } from "pg";
import { AtlasConfig } from "./config.js";
import { registerWhatsAppRoutes } from "./whatsapp/routes.js";
import { registerBridgeRoutes } from "./bridge/routes.js";
import { builtInSkills, skillManifestForIds } from "./skills/skillCatalog.js";

export async function buildServer(config: AtlasConfig, pool: Pool): Promise<FastifyInstance> {
  const app = fastify({
    logger: {
      level: config.logLevel
    },
    bodyLimit: 1024 * 1024
  });

  app.addContentTypeParser("application/json", { parseAs: "buffer" }, (request, body, done) => {
    const rawBody = Buffer.isBuffer(body) ? body : Buffer.from(body);
    request.rawBody = rawBody;

    try {
      done(null, JSON.parse(rawBody.toString("utf8")) as unknown);
    } catch (error) {
      done(error as Error);
    }
  });

  app.get("/health", async () => ({
    ok: true,
    service: "atlas-api",
    runtimeMode: config.runtimeMode,
    whatsappConfigured: Boolean(config.whatsapp.phoneNumberId && config.whatsapp.accessToken),
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

  app.get("/skills", async () => ({
    skills: skillManifestForIds(builtInSkills.map((skill) => skill.id))
  }));

  await registerWhatsAppRoutes(app, pool, config);
  await registerBridgeRoutes(app, pool, config);

  return app;
}

declare module "fastify" {
  interface FastifyRequest {
    rawBody?: Buffer;
  }
}
