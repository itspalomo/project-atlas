import { FastifyInstance } from "fastify";
import { Pool } from "pg";
import { z } from "zod";
import { AtlasConfig } from "../config.js";
import { verifyWhatsAppSignature } from "../security/whatsappSignature.js";
import { findWhatsAppIdentity } from "../identity/identityService.js";
import { normalizePhoneNumber } from "../identity/phone.js";
import { sendWhatsAppText } from "./client.js";
import { recordAuditLog } from "../audit/auditLog.js";
import { selectAgentForMessage } from "../routing/agentSelection.js";
import { generateAgentReply } from "../agents/agentGateway.js";

const verificationQuerySchema = z.object({
  "hub.mode": z.string(),
  "hub.verify_token": z.string(),
  "hub.challenge": z.string()
});

const webhookBodySchema = z.object({
  object: z.string().optional(),
  entry: z
    .array(
      z.object({
        id: z.string().optional(),
        changes: z.array(
          z.object({
            field: z.string().optional(),
            value: z.object({
              messaging_product: z.string().optional(),
              metadata: z.record(z.string(), z.unknown()).optional(),
              contacts: z
                .array(
                  z.object({
                    wa_id: z.string(),
                    profile: z.object({ name: z.string().optional() }).optional()
                  })
                )
                .optional(),
              messages: z
                .array(
                  z.object({
                    from: z.string(),
                    id: z.string(),
                    timestamp: z.string().optional(),
                    type: z.string(),
                    text: z.object({ body: z.string() }).optional()
                  })
                )
                .optional(),
              statuses: z.array(z.record(z.string(), z.unknown())).optional()
            })
          })
        )
      })
    )
    .default([])
});

export async function registerWhatsAppRoutes(
  app: FastifyInstance,
  pool: Pool,
  config: AtlasConfig
): Promise<void> {
  app.get("/webhooks/whatsapp", async (request, reply) => {
    const query = verificationQuerySchema.safeParse(request.query);

    if (
      query.success &&
      query.data["hub.mode"] === "subscribe" &&
      query.data["hub.verify_token"] === config.whatsapp.verifyToken
    ) {
      return reply.type("text/plain").send(query.data["hub.challenge"]);
    }

    await recordAuditLog(pool, {
      action: "whatsapp.webhook_verification.failed",
      metadata: { query: request.query },
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"]
    });

    return reply.code(403).send({ ok: false });
  });

  app.post("/webhooks/whatsapp", async (request, reply) => {
    if (config.whatsapp.appSecret) {
      const valid = verifyWhatsAppSignature(
        request.rawBody ?? Buffer.from([]),
        headerValue(request.headers["x-hub-signature-256"]),
        config.whatsapp.appSecret
      );

      if (!valid) {
        await recordAuditLog(pool, {
          action: "whatsapp.webhook_signature.invalid",
          ipAddress: request.ip,
          userAgent: request.headers["user-agent"]
        });

        return reply.code(401).send({ ok: false });
      }
    }

    const parsed = webhookBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: "invalid_webhook_payload" });
    }

    let handled = 0;
    for (const message of extractTextMessages(parsed.data)) {
      handled += 1;
      await handleInboundTextMessage(pool, config, message);
    }

    return reply.send({ ok: true, handled });
  });
}

type InboundTextMessage = {
  from: string;
  messageId: string;
  text: string;
  timestamp?: string;
};

function extractTextMessages(payload: z.infer<typeof webhookBodySchema>): InboundTextMessage[] {
  const messages: InboundTextMessage[] = [];

  for (const entry of payload.entry) {
    for (const change of entry.changes) {
      for (const message of change.value.messages ?? []) {
        if (message.type !== "text" || !message.text?.body) {
          continue;
        }

        messages.push({
          from: message.from,
          messageId: message.id,
          text: message.text.body,
          timestamp: message.timestamp
        });
      }
    }
  }

  return messages;
}

async function handleInboundTextMessage(
  pool: Pool,
  config: AtlasConfig,
  message: InboundTextMessage
): Promise<void> {
  const normalizedFrom = normalizePhoneNumber(message.from);
  const identity = await findWhatsAppIdentity(pool, message.from);

  if (!identity) {
    await recordAuditLog(pool, {
      action: "whatsapp.message.rejected_unauthorized_sender",
      subjectType: "whatsapp_sender",
      subjectId: normalizedFrom,
      metadata: { messageId: message.messageId }
    });

    if (config.whatsapp.sendUnauthorizedReply) {
      await sendWhatsAppText(config, normalizedFrom, "This Atlas number is private and your number is not authorized.");
    }

    return;
  }

  const selected = await selectAgentForMessage(pool, identity.userId, identity.agentId, message.text);
  const conversationId = `whatsapp:${normalizedFrom}:${selected.agentId}`;

  await pool.query(
    `
      insert into inbound_messages (
        channel,
        channel_message_id,
        channel_sender_id,
        user_id,
        agent_id,
        body,
        received_at
      )
      values ('whatsapp', $1, $2, $3, $4, $5, to_timestamp($6))
      on conflict (channel, channel_message_id)
      do nothing
    `,
    [
      message.messageId,
      normalizedFrom,
      identity.userId,
      selected.agentId,
      selected.cleanedText,
      Number(message.timestamp ?? Math.floor(Date.now() / 1000))
    ]
  );

  await recordAuditLog(pool, {
    actorUserId: identity.userId,
    action: "whatsapp.message.accepted",
    subjectType: "agent",
    subjectId: selected.agentId,
    metadata: { messageId: message.messageId }
  });

  const agentReply = await generateAgentReply(pool, config, {
    agentId: selected.agentId,
    userId: identity.userId,
    text: selected.cleanedText,
    channel: "whatsapp",
    conversationId
  });

  const response = await sendWhatsAppText(config, normalizedFrom, agentReply.text);

  await pool.query(
    `
      insert into outbound_messages (
        channel,
        channel_recipient_id,
        user_id,
        agent_id,
        body,
        runtime,
        provider_status
      )
      values ('whatsapp', $1, $2, $3, $4, $5, $6)
    `,
    [
      normalizedFrom,
      identity.userId,
      selected.agentId,
      agentReply.text,
      agentReply.runtime,
      response ? `${response.status}` : "not_configured"
    ]
  );
}

function headerValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}
