export type AtlasSkill = {
  id: string;
  title: string;
  category: "coordination" | "memory" | "wellness" | "productivity" | "context";
  summary: string;
  structuredFacts: string[];
  allowedActions: string[];
  approvalRequired: string[];
};

export const builtInSkills: AtlasSkill[] = [
  {
    id: "household",
    title: "Household Coordination",
    category: "coordination",
    summary: "Coordinate shared family or household context without crossing private user boundaries.",
    structuredFacts: ["agent memberships", "shared goals", "shared approvals", "shared memory grants"],
    allowedActions: ["Summarize shared plans", "Coordinate household decisions", "Route private questions back to the owner"],
    approvalRequired: ["Making commitments for another user", "Sharing private user facts into a shared workspace"]
  },
  {
    id: "planning",
    title: "Planning",
    category: "productivity",
    summary: "Turn goals, availability, and user constraints into practical plans.",
    structuredFacts: ["goals", "calendar busy blocks", "approvals", "reminders"],
    allowedActions: ["Draft plans", "Suggest tradeoffs", "Break goals into next actions"],
    approvalRequired: ["Changing goals", "Creating commitments", "Changing another user's plan"]
  },
  {
    id: "calendar",
    title: "Calendar Availability",
    category: "productivity",
    summary: "Use availability windows and intentionally shared calendar details.",
    structuredFacts: ["calendar busy blocks", "calendar events with visibility controls"],
    allowedActions: ["Reason about free/busy windows", "Suggest meeting times", "Explain schedule conflicts"],
    approvalRequired: ["Creating calendar events", "Editing calendar events", "Sharing event titles or details"]
  },
  {
    id: "reminders",
    title: "Reminders",
    category: "productivity",
    summary: "Propose and track reminders while the iOS bridge owns local Apple Reminders writes.",
    structuredFacts: ["reminders", "approvals"],
    allowedActions: ["Draft reminder text", "Suggest due dates", "Summarize open reminders"],
    approvalRequired: ["Creating reminders", "Editing reminders", "Completing or cancelling reminders"]
  },
  {
    id: "health",
    title: "Health Summary",
    category: "wellness",
    summary: "Use summarized HealthKit-derived metrics for non-diagnostic coaching and context.",
    structuredFacts: ["health daily summaries", "workout summaries", "sleep minutes", "active energy"],
    allowedActions: ["Summarize trends", "Relate workouts to recovery context", "Suggest conservative wellness habits"],
    approvalRequired: ["Sharing health facts outside the user's workspace", "Changing health or fitness goals"]
  },
  {
    id: "training",
    title: "Training Support",
    category: "wellness",
    summary: "Combine workouts, recovery, schedule, and gym context into practical training support.",
    structuredFacts: [
      "training plans",
      "planned workouts",
      "planned workout exercises and sets",
      "performed workouts",
      "performed workout exercises and sets",
      "health daily summaries",
      "location signals",
      "calendar busy blocks",
      "goals"
    ],
    allowedActions: [
      "Draft workout plans",
      "Suggest workout adjustments",
      "Compare planned versus performed set work",
      "Flag recovery constraints",
      "Connect gym presence to scheduled sessions"
    ],
    approvalRequired: ["Changing training goals", "Committing another user to a session", "Sharing training details outside the user's workspace"]
  },
  {
    id: "nutrition",
    title: "Nutrition Intake",
    category: "wellness",
    summary: "Use calorie, macro, hydration, meal, and confidence facts without running a full food database server.",
    structuredFacts: ["nutrition daily summaries", "nutrition meal entries", "source confidence"],
    allowedActions: ["Summarize intake", "Compare intake to user goals", "Suggest simple habit changes"],
    approvalRequired: ["Sharing nutrition facts outside the user's workspace", "Changing nutrition goals"]
  },
  {
    id: "location",
    title: "Semantic Location",
    category: "context",
    summary: "Use coarse semantic place signals such as home, work, gym, school, or unknown.",
    structuredFacts: ["location signals"],
    allowedActions: ["Reason about current context", "Adapt reminders or suggestions to coarse place"],
    approvalRequired: ["Sharing location context outside the user's workspace"]
  },
  {
    id: "memory",
    title: "Honcho Memory",
    category: "memory",
    summary: "Use Hermes' native Honcho provider with the Atlas-generated workspace config.",
    structuredFacts: ["honcho workspace id", "shared memory grants"],
    allowedActions: ["Use workspace memory for preferences", "Summarize remembered preferences"],
    approvalRequired: ["Copying personal memory into a shared workspace", "Using revoked shared memory"]
  }
];

const builtInSkillsById = new Map(builtInSkills.map((skill) => [skill.id, skill]));

export function validateSkillIds(skillIds: string[], ownerLabel: string): void {
  const seen = new Set<string>();

  for (const skillId of skillIds) {
    if (seen.has(skillId)) {
      throw new Error(`${ownerLabel} lists duplicate skill ${skillId}`);
    }
    seen.add(skillId);

    if (!builtInSkillsById.has(skillId)) {
      throw new Error(`${ownerLabel} references unknown skill ${skillId}. Built-in skills: ${builtInSkills.map((skill) => skill.id).join(", ")}`);
    }
  }
}

export function resolveSkills(skillIds: string[]): AtlasSkill[] {
  validateSkillIds(skillIds, "Agent");
  return skillIds.map((skillId) => builtInSkillsById.get(skillId)).filter((skill): skill is AtlasSkill => Boolean(skill));
}

export function skillManifestForIds(skillIds: string[]): AtlasSkill[] {
  return resolveSkills(skillIds);
}

export function renderAtlasCapabilitySkill(skillIds: string[]): string {
  const skills = resolveSkills(skillIds);
  const capabilityLines =
    skills.length === 0
      ? ["- No Atlas custom data capabilities are enabled for this profile yet."]
      : skills.flatMap((skill) => [
          `- ${skill.id}: ${skill.summary}`,
          `  - Structured facts: ${skill.structuredFacts.join(", ")}.`,
          `  - Allowed actions: ${skill.allowedActions.join(", ")}.`,
          `  - Approval required for: ${skill.approvalRequired.join(", ")}.`
        ]);

  return [
    "---",
    "name: atlas-context",
    "description: Use Atlas custom bridge and deterministic data surfaces when the user asks about shared household context, iOS bridge data, health, training, nutrition, calendar availability, reminders, approvals, or semantic location.",
    "---",
    "",
    "# Atlas Context",
    "",
    "Atlas is a custom data and bridge layer. Hermes owns messaging, model/provider auth, profile behavior, native skills, tools, MCP, and memory providers.",
    "",
    "## When To Use",
    "",
    "Load this skill when a user asks for Atlas-managed structured facts or bridge actions, including iOS HealthKit summaries, workout plans, performed workouts, nutrition intake, free/busy calendar context, Apple Reminders proposals, semantic location, approvals, or household-scoped custom facts.",
    "",
    "## Procedure",
    "",
    "1. Use Hermes-native messaging, memory, skills, and tools first.",
    "2. For Atlas-managed deterministic facts, use the Atlas MCP server when it is configured. The primary tool is `mcp_atlas_atlas_get_context`.",
    "3. Pass the Atlas `userId`, `agentId`, and relevant capability ids from this profile's generated metadata.",
    "4. If Atlas returns no context, or the user has not connected or authorized the iOS bridge data, ask the user to connect or authorize the bridge data, or to provide the missing information in chat.",
    "5. Do not claim access to raw HealthKit samples, raw calendar event details, or raw location history. Atlas stores summaries, busy windows, and semantic places unless the user explicitly shares more through the bridge.",
    "6. Calendar, reminder, goal, training-plan, commitment, and cross-user sharing writes require Atlas approval records and iOS bridge execution.",
    "",
    "## Enabled Capabilities",
    "",
    ...capabilityLines
  ]
    .join("\n")
    .trimEnd();
}
