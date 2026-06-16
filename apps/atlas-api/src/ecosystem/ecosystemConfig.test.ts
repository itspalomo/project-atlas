import { describe, expect, it } from "vitest";
import { agentPrompt, EcosystemAgent } from "./ecosystemConfig.js";

describe("ecosystem config", () => {
  it("appends enabled data capabilities to custom prompts", () => {
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
    expect(prompt).toContain("Atlas Data Capabilities");
    expect(prompt).toContain("calendar: Use availability windows");
    expect(prompt).toContain("health: Use summarized HealthKit-derived metrics");
  });

  it("uses a minimal non-persona default prompt", () => {
    const agent: EcosystemAgent = {
      id: "household",
      displayName: "Household Atlas",
      type: "shared",
      owners: ["user-one"],
      members: ["user-one"],
      skills: [],
      routing: {
        defaultFor: ["user-one"],
        aliases: ["/family"]
      },
      runtime: {}
    };

    const prompt = agentPrompt(agent);
    expect(prompt).toContain("Hermes is the reasoning runtime");
    expect(prompt).toContain("ask the user to connect or authorize the bridge data");
    expect(prompt).not.toContain("You are");
  });
});
