import { describe, expect, it, vi } from "vitest";
import { selectAgentForMessage } from "./agentSelection.js";

describe("selectAgentForMessage", () => {
  it("keeps the personal agent by default", async () => {
    const pool = { query: vi.fn().mockResolvedValue({ rows: [] }) };
    const result = await selectAgentForMessage(pool as never, "user-1", "household", "what is next?");

    expect(result).toEqual({
      agentId: "household",
      cleanedText: "what is next?"
    });
  });

  it("routes alias-prefixed messages to the configured shared agent when the user is a member", async () => {
    const pool = {
      query: vi
        .fn()
        .mockResolvedValueOnce({
          rows: [{ id: "household", config: { routingAliases: ["family:", "/family"] } }]
        })
        .mockResolvedValueOnce({ rowCount: 1 })
    };
    const result = await selectAgentForMessage(pool as never, "user-1", "personal-user-1", "family: plan dinner");

    expect(result).toEqual({
      agentId: "household",
      cleanedText: "plan dinner"
    });
  });

  it("falls back to the default agent when alias access is missing", async () => {
    const pool = {
      query: vi
        .fn()
        .mockResolvedValueOnce({
          rows: [{ id: "household", config: { routingAliases: ["/family"] } }]
        })
        .mockResolvedValueOnce({ rowCount: 0 })
    };
    const result = await selectAgentForMessage(pool as never, "guest", "personal-user-1", "/family plan dinner");

    expect(result).toEqual({
      agentId: "personal-user-1",
      cleanedText: "/family plan dinner"
    });
  });
});
