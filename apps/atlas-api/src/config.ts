import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.string().default("development"),
  LOG_LEVEL: z.string().default("info"),
  ATLAS_API_HOST: z.string().default("0.0.0.0"),
  ATLAS_API_PORT: z.coerce.number().int().positive().default(3000),
  ATLAS_PUBLIC_BASE_URL: z.string().url().optional(),
  DATABASE_URL: z.string().min(1),
  ATLAS_ECOSYSTEM_CONFIG: z.string().default("ecosystem/atlas.yaml"),
  ATLAS_MCP_URL: z.string().url().default("http://atlas-api:3000/mcp"),
  ATLAS_MCP_KEY: z.string().optional(),
  HONCHO_BASE_URL: z.string().url().optional(),
  HONCHO_API_KEY: z.string().optional(),
  ATLAS_BRIDGE_API_KEY: z.string().optional()
});

export type AtlasConfig = {
  nodeEnv: string;
  logLevel: string;
  host: string;
  port: number;
  publicBaseUrl?: string;
  databaseUrl: string;
  ecosystemConfigPath: string;
  mcp: {
    url: string;
    key?: string;
  };
  honcho?: {
    baseUrl?: string;
    apiKey?: string;
  };
  bridgeApiKey?: string;
};

export function loadConfig(env = process.env): AtlasConfig {
  const parsed = envSchema.parse(env);

  return {
    nodeEnv: parsed.NODE_ENV,
    logLevel: parsed.LOG_LEVEL,
    host: parsed.ATLAS_API_HOST,
    port: parsed.ATLAS_API_PORT,
    publicBaseUrl: parsed.ATLAS_PUBLIC_BASE_URL,
    databaseUrl: parsed.DATABASE_URL,
    ecosystemConfigPath: parsed.ATLAS_ECOSYSTEM_CONFIG,
    mcp: {
      url: parsed.ATLAS_MCP_URL,
      key: parsed.ATLAS_MCP_KEY
    },
    honcho: {
      baseUrl: parsed.HONCHO_BASE_URL,
      apiKey: parsed.HONCHO_API_KEY
    },
    bridgeApiKey: parsed.ATLAS_BRIDGE_API_KEY
  };
}
