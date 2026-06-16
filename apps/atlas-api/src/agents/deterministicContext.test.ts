import { describe, expect, it, vi } from "vitest";
import { buildDeterministicContext } from "./deterministicContext.js";

describe("buildDeterministicContext", () => {
  it("does not query deterministic tables when matching skills are absent", async () => {
    const pool = { query: vi.fn() };

    const context = await buildDeterministicContext(pool as never, {
      userId: "user-one",
      agentId: "household",
      skills: ["calendar"]
    });

    expect(context).toEqual({ content: "", sections: [] });
    expect(pool.query).not.toHaveBeenCalled();
  });

  it("renders recent planned and performed training facts for training agents", async () => {
    const pool = {
      query: vi
        .fn()
        .mockResolvedValueOnce({
          rows: [
            {
              id: "planned-1",
              title: "Lower Strength",
              workout_type: "strength",
              status: "completed",
              scheduled_start_at: new Date("2026-06-17T15:00:00.000Z"),
              scheduled_end_at: new Date("2026-06-17T16:00:00.000Z"),
              notes: "Squat focus"
            }
          ]
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: "performed-1",
              workout_type: "strength",
              source: "healthkit",
              source_device: "apple_watch",
              started_at: new Date("2026-06-17T15:03:00.000Z"),
              ended_at: new Date("2026-06-17T15:58:00.000Z"),
              duration_minutes: "55",
              active_energy_kcal: "325",
              perceived_effort: "7"
            }
          ]
        })
        .mockResolvedValueOnce({
          rows: [
            {
              workout_id: "planned-1",
              name: "Back Squat",
              sets: [
                {
                  setIndex: 0,
                  setType: "working",
                  targetRepsMin: 5,
                  targetRepsMax: 5,
                  targetWeightKg: "102.500",
                  restSeconds: 180
                }
              ]
            }
          ]
        })
        .mockResolvedValueOnce({
          rows: [
            {
              workout_id: "performed-1",
              name: "Back Squat",
              sets: [
                {
                  setIndex: 0,
                  status: "completed",
                  reps: 5,
                  weightKg: "102.500",
                  rpe: "7.5"
                }
              ]
            }
          ]
        })
    };

    const context = await buildDeterministicContext(pool as never, {
      userId: "user-one",
      agentId: "household",
      skills: ["training"]
    });

    expect(context.sections).toEqual(["training"]);
    expect(context.content).toContain("Atlas Deterministic Context");
    expect(context.content).toContain("Lower Strength");
    expect(context.content).toContain("Back Squat: set 1 working 5 reps @ 102.5 kg rest 180s");
    expect(context.content).toContain("strength from healthkit/apple_watch");
    expect(context.content).toContain("Back Squat: set 1 completed 5 reps @ 102.5 kg RPE 7.5");
  });
});
