import { describe, expect, it } from "vitest";
import { renderSkillPrompt, resolveSkills, skillManifestForIds, validateSkillIds } from "./skillCatalog.js";

describe("skill catalog", () => {
  it("resolves built-in skills in configured order", () => {
    expect(resolveSkills(["calendar", "reminders"]).map((skill) => skill.id)).toEqual(["calendar", "reminders"]);
  });

  it("fails fast for unknown or duplicated skills", () => {
    expect(() => validateSkillIds(["calendar", "calendar"], "Agent household")).toThrow(/duplicate skill calendar/);
    expect(() => validateSkillIds(["unknown"], "Agent household")).toThrow(/unknown skill unknown/);
  });

  it("renders data capability context without leaking prompt-only fields into the manifest", () => {
    const prompt = renderSkillPrompt(["health"]);
    expect(prompt).toContain("Atlas Data Capabilities");
    expect(prompt).toContain("health: Use summarized HealthKit-derived metrics");
    expect(prompt).toContain("If needed data is absent, ask the user to connect or authorize the iOS bridge");

    const manifest = skillManifestForIds(["health"]);
    expect(manifest[0]).toMatchObject({ id: "health", title: "Health Summary" });
    expect(manifest[0]).not.toHaveProperty("promptGuidance");
  });
});
