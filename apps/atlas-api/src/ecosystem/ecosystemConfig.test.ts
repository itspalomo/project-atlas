import { describe, expect, it } from "vitest";
import { agentPrompt, EcosystemAgent } from "./ecosystemConfig.js";

describe("ecosystem config", () => {
  it("appends enabled skill guidance to custom prompts", () => {
    const agent: EcosystemAgent = {
      id: "household",
      displayName: "Household Atlas",
      type: "shared",
      owners: ["user-one"],
      members: ["user-one"],
      skills: ["calendar", "health"],
      routing: {
        defaultFor: ["user-one"],
        aliases: ["/family"]
      },
      runtime: {},
      prompt: "# Custom prompt"
    };

    const prompt = agentPrompt(agent);
    expect(prompt).toContain("# Custom prompt");
    expect(prompt).toContain("Atlas Baked-In Skills");
    expect(prompt).toContain("Calendar Availability");
    expect(prompt).toContain("Health Summary");
  });
});
