import { describe, expect, it } from "vitest";
import { agentHermesProfile, agentHonchoWorkspace, EcosystemAgent } from "./ecosystemConfig.js";

describe("ecosystem config", () => {
  it("defaults Hermes profile and Honcho workspace to the agent id", () => {
    const agent: EcosystemAgent = {
      id: "household",
      displayName: "Household Atlas",
      type: "shared",
      owners: ["user-one"],
      members: ["user-one"],
      skills: []
    };

    expect(agentHermesProfile(agent)).toBe("household");
    expect(agentHonchoWorkspace(agent)).toBe("household");
  });

  it("allows explicit Hermes profile and Honcho workspace names", () => {
    const agent: EcosystemAgent = {
      id: "family",
      displayName: "Family",
      type: "shared",
      hermesProfile: "family-profile",
      honchoWorkspace: "shared-family",
      owners: ["user-one"],
      members: ["user-one", "user-two"],
      skills: []
    };

    expect(agentHermesProfile(agent)).toBe("family-profile");
    expect(agentHonchoWorkspace(agent)).toBe("shared-family");
  });
});
