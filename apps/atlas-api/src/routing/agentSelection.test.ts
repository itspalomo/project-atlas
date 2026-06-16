import { describe, expect, it, vi } from "vitest";
import { selectAgentForMessage } from "./agentSelection.js";

describe("selectAgentForMessage", () => {
  it("keeps the personal agent by default", async () => {
    const pool = { query: vi.fn() };
    const result = await selectAgentForMessage(pool as never, "jose", "atlas-jose", "what is next?");

    expect(result).toEqual({
      agentId: "atlas-jose",
      cleanedText: "what is next?"
    });
    expect(pool.query).not.toHaveBeenCalled();
  });

  it("routes family-prefixed messages to atlas-family when the user is a member", async () => {
    const pool = { query: vi.fn().mockResolvedValue({ rowCount: 1 }) };
    const result = await selectAgentForMessage(pool as never, "jose", "atlas-jose", "family: plan dinner");

    expect(result).toEqual({
      agentId: "atlas-family",
      cleanedText: "plan dinner"
    });
  });

  it("falls back to the personal agent when family access is missing", async () => {
    const pool = { query: vi.fn().mockResolvedValue({ rowCount: 0 }) };
    const result = await selectAgentForMessage(pool as never, "guest", "atlas-jose", "/family plan dinner");

    expect(result).toEqual({
      agentId: "atlas-jose",
      cleanedText: "/family plan dinner"
    });
  });
});
