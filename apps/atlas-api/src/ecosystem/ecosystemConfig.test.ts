import { describe, expect, it } from "vitest";
import {
  agentHermesProfile,
  agentHonchoWorkspace,
  agentRuntimeGroup,
  ecosystemRuntimeGroups,
  EcosystemAgent,
  EcosystemConfig
} from "./ecosystemConfig.js";

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
    expect(agentRuntimeGroup(agent)).toBe("default");
  });

  it("allows explicit Hermes profile and Honcho workspace names", () => {
    const agent: EcosystemAgent = {
      id: "family",
      displayName: "Family",
      type: "shared",
      runtimeGroup: "shared-runtime",
      hermesProfile: "family-profile",
      honchoWorkspace: "shared-family",
      owners: ["user-one"],
      members: ["user-one", "user-two"],
      skills: []
    };

    expect(agentHermesProfile(agent)).toBe("family-profile");
    expect(agentHonchoWorkspace(agent)).toBe("shared-family");
    expect(agentRuntimeGroup(agent)).toBe("shared-runtime");
  });

  it("defaults to a single runtime group when none are configured", () => {
    const config: EcosystemConfig = {
      version: 1,
      project: {
        id: "household",
        name: "Household"
      },
      runtimeGroups: [],
      users: [
        {
          id: "user-one",
          displayName: "User One",
          kind: "person",
          identities: []
        }
      ],
      agents: [
        {
          id: "household",
          displayName: "Household",
          type: "shared",
          owners: ["user-one"],
          members: ["user-one"],
          skills: []
        }
      ]
    };

    expect(ecosystemRuntimeGroups(config)).toEqual([
      {
        id: "default",
        displayName: "Default Hermes Runtime",
        isolation: "container",
        ports: {}
      }
    ]);
  });
});
