import { describe, expect, it } from "vitest";
import { renderAtlasCapabilitySkill, resolveSkills, skillManifestForIds, validateSkillIds } from "./skillCatalog.js";

describe("skill catalog", () => {
  it("resolves built-in skills in configured order", () => {
    expect(resolveSkills(["calendar", "reminders"]).map((skill) => skill.id)).toEqual(["calendar", "reminders"]);
  });

  it("fails fast for unknown or duplicated skills", () => {
    expect(() => validateSkillIds(["calendar", "calendar"], "Agent household")).toThrow(/duplicate skill calendar/);
    expect(() => validateSkillIds(["unknown"], "Agent household")).toThrow(/unknown skill unknown/);
  });

  it("renders data capability context as a Hermes skill without leaking non-capability fields into the manifest", () => {
    const prompt = renderAtlasCapabilitySkill(["health"]);
    expect(prompt).toContain("name: atlas-context");
    expect(prompt).toContain("health: Use summarized HealthKit-derived metrics");
    expect(prompt).toContain("The primary tool is `mcp_atlas_atlas_get_context`");

    const manifest = skillManifestForIds(["health"]);
    expect(manifest[0]).toMatchObject({ id: "health", title: "Health Summary" });
    expect(manifest[0]).not.toHaveProperty("promptGuidance");
  });
});
