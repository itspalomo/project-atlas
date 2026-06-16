import { Pool } from "pg";
import { loadConfig } from "../config.js";

export function createPool(): Pool {
  const config = loadConfig();

  return new Pool({
    connectionString: config.databaseUrl,
    max: 10,
    idleTimeoutMillis: 30_000
  });
}
