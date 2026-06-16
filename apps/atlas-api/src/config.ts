import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.string().default("development"),
  LOG_LEVEL: z.string().default("info"),
  ATLAS_API_HOST: z.string().default("0.0.0.0"),
  ATLAS_API_PORT: z.coerce.number().int().positive().default(3000),
  ATLAS_PUBLIC_BASE_URL: z.string().url().optional(),
  DATABASE_URL: z.string().min(1),
  WHATSAPP_GRAPH_API_VERSION: z.string().default("v24.0"),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_ACCESS_TOKEN: z.string().optional(),
  WHATSAPP_APP_SECRET: z.string().optional(),
  WHATSAPP_VERIFY_TOKEN: z.string().min(1),
  WHATSAPP_SEND_UNAUTHORIZED_REPLY: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  ATLAS_RUNTIME_MODE: z.enum(["stub", "hermes"]).default("stub"),
  HERMES_ATLAS_JOSE_URL: z.string().url().optional(),
  HERMES_ATLAS_WIFE_URL: z.string().url().optional(),
  HERMES_ATLAS_FAMILY_URL: z.string().url().optional(),
  HERMES_MODEL: z.string().default("hermes"),
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
  whatsapp: {
    graphApiVersion: string;
    phoneNumberId?: string;
    accessToken?: string;
    appSecret?: string;
    verifyToken: string;
    sendUnauthorizedReply: boolean;
  };
  runtimeMode: "stub" | "hermes";
  hermesProfileUrls: {
    atlasJose?: string;
    atlasWife?: string;
    atlasFamily?: string;
  };
  hermesModel: string;
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
    whatsapp: {
      graphApiVersion: parsed.WHATSAPP_GRAPH_API_VERSION,
      phoneNumberId: parsed.WHATSAPP_PHONE_NUMBER_ID,
      accessToken: parsed.WHATSAPP_ACCESS_TOKEN,
      appSecret: parsed.WHATSAPP_APP_SECRET,
      verifyToken: parsed.WHATSAPP_VERIFY_TOKEN,
      sendUnauthorizedReply: parsed.WHATSAPP_SEND_UNAUTHORIZED_REPLY
    },
    runtimeMode: parsed.ATLAS_RUNTIME_MODE,
    hermesProfileUrls: {
      atlasJose: parsed.HERMES_ATLAS_JOSE_URL,
      atlasWife: parsed.HERMES_ATLAS_WIFE_URL,
      atlasFamily: parsed.HERMES_ATLAS_FAMILY_URL
    },
    hermesModel: parsed.HERMES_MODEL,
    honcho: {
      baseUrl: parsed.HONCHO_BASE_URL,
      apiKey: parsed.HONCHO_API_KEY
    },
    bridgeApiKey: parsed.ATLAS_BRIDGE_API_KEY
  };
}
