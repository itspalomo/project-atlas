import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyWhatsAppSignature } from "./whatsappSignature.js";

describe("verifyWhatsAppSignature", () => {
  it("accepts valid sha256 signatures", () => {
    const body = Buffer.from(JSON.stringify({ hello: "atlas" }));
    const secret = "app-secret";
    const signature = createHmac("sha256", secret).update(body).digest("hex");

    expect(verifyWhatsAppSignature(body, `sha256=${signature}`, secret)).toBe(true);
  });

  it("rejects invalid signatures", () => {
    const body = Buffer.from(JSON.stringify({ hello: "atlas" }));

    expect(verifyWhatsAppSignature(body, "sha256=deadbeef", "app-secret")).toBe(false);
  });
});
