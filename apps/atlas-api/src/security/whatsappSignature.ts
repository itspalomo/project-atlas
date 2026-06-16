import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyWhatsAppSignature(rawBody: Buffer, signatureHeader: string | undefined, appSecret: string): boolean {
  if (!signatureHeader?.startsWith("sha256=")) {
    return false;
  }

  const expectedHex = createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const providedHex = signatureHeader.slice("sha256=".length);

  const expected = Buffer.from(expectedHex, "hex");
  const provided = Buffer.from(providedHex, "hex");

  if (expected.length !== provided.length) {
    return false;
  }

  return timingSafeEqual(expected, provided);
}
