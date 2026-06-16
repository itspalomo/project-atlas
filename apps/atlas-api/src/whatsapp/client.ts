import { AtlasConfig } from "../config.js";

export async function sendWhatsAppText(config: AtlasConfig, to: string, body: string): Promise<Response | undefined> {
  if (!config.whatsapp.phoneNumberId || !config.whatsapp.accessToken) {
    return undefined;
  }

  return fetch(
    `https://graph.facebook.com/${config.whatsapp.graphApiVersion}/${config.whatsapp.phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.whatsapp.accessToken}`,
        "content-type": "application/json"
      },
      signal: AbortSignal.timeout(config.whatsapp.requestTimeoutMs),
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: {
          preview_url: false,
          body
        }
      })
    }
  );
}
