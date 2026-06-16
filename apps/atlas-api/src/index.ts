import { buildServer } from "./server.js";
import { loadConfig } from "./config.js";
import { createPool } from "./db/pool.js";

const config = loadConfig();
const pool = createPool();
const app = await buildServer(config, pool);

const shutdown = async (): Promise<void> => {
  await app.close();
  await pool.end();
};

process.on("SIGINT", () => {
  shutdown().finally(() => process.exit(0));
});

process.on("SIGTERM", () => {
  shutdown().finally(() => process.exit(0));
});

await app.listen({ host: config.host, port: config.port });
