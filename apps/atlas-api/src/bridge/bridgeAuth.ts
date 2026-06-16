import { FastifyRequest } from "fastify";
import { Pool } from "pg";
import { createHash, timingSafeEqual } from "node:crypto";
import { AtlasConfig } from "../config.js";

export type BridgePrincipal = {
  type: "bootstrap" | "device";
  deviceId?: string;
  userId?: string;
};

export class BridgeAuthError extends Error {
  constructor(message = "Unauthorized bridge request") {
    super(message);
  }
}

export function assertBridgeUser(principal: BridgePrincipal, userId: string): void {
  if (principal.type === "bootstrap") {
    return;
  }

  if (principal.userId !== userId) {
    throw new BridgeAuthError("Bridge device cannot access this user");
  }
}

export function assertBridgeBootstrap(principal: BridgePrincipal): void {
  if (principal.type !== "bootstrap") {
    throw new BridgeAuthError("Bootstrap bridge token required");
  }
}

export async function authenticateBridgeRequest(
  request: FastifyRequest,
  pool: Pool,
  config: AtlasConfig
): Promise<BridgePrincipal> {
  const token = parseBearerToken(request.headers.authorization);
  if (!token) {
    throw new BridgeAuthError();
  }

  if (config.bridgeApiKey && safeEqual(token, config.bridgeApiKey)) {
    return { type: "bootstrap" };
  }

  const deviceId = headerValue(request.headers["x-atlas-device-id"]);
  if (!deviceId) {
    throw new BridgeAuthError();
  }

  const tokenHash = sha256(token);
  const result = await pool.query<{
    id: string;
    user_id: string;
    token_hash: string;
    is_enabled: boolean;
  }>(
    `
      select id, user_id, token_hash, is_enabled
      from bridge_devices
      where id = $1
      limit 1
    `,
    [deviceId]
  );

  const device = result.rows[0];
  if (!device?.is_enabled || !safeEqual(tokenHash, device.token_hash)) {
    throw new BridgeAuthError();
  }

  await pool.query("update bridge_devices set last_seen_at = now(), updated_at = now() where id = $1", [device.id]);

  return {
    type: "device",
    deviceId: device.id,
    userId: device.user_id
  };
}

function parseBearerToken(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const [scheme, token] = value.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return undefined;
  }

  return token.trim();
}

function headerValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

export function hashBridgeToken(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function sha256(value: string): string {
  return hashBridgeToken(value);
}
