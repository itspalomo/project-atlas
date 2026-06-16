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

  it("renders prompt guidance without leaking prompt-only fields into the manifest", () => {
    const prompt = renderSkillPrompt(["health"]);
    expect(prompt).toContain("Atlas Baked-In Skills");
    expect(prompt).toContain("Health Summary");

    const manifest = skillManifestForIds(["health"]);
    expect(manifest[0]).toMatchObject({ id: "health", title: "Health Summary" });
    expect(manifest[0]).not.toHaveProperty("promptGuidance");
  });
});
