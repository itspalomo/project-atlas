export type AtlasSkill = {
  id: string;
  title: string;
  category: "coordination" | "channel" | "memory" | "wellness" | "productivity" | "context";
  summary: string;
  structuredFacts: string[];
  allowedActions: string[];
  approvalRequired: string[];
  promptGuidance: string[];
};

export const builtInSkills: AtlasSkill[] = [
  {
    id: "household",
    title: "Household Coordination",
    category: "coordination",
    summary: "Coordinate shared family or household context without crossing private user boundaries.",
    structuredFacts: ["agent memberships", "shared goals", "shared approvals", "shared memory grants"],
    allowedActions: ["Summarize shared plans", "Coordinate household decisions", "Route private questions back to the owner"],
    approvalRequired: ["Making commitments for another user", "Sharing private user facts into a shared workspace"],
    promptGuidance: [
      "Use only facts intentionally shared with this agent or facts exposed through Atlas as shared facts.",
      "When a request needs private context from another user, ask that user or create an approval request instead of guessing.",
      "Prefer short, actionable coordination messages over broad commentary."
    ]
  },
  {
    id: "planning",
    title: "Planning",
    category: "productivity",
    summary: "Turn goals, availability, and user constraints into practical plans.",
    structuredFacts: ["goals", "calendar busy blocks", "approvals", "reminders"],
    allowedActions: ["Draft plans", "Suggest tradeoffs", "Break goals into next actions"],
    approvalRequired: ["Changing goals", "Creating commitments", "Changing another user's plan"],
    promptGuidance: [
      "Treat PostgreSQL structured facts as source of truth when they are available.",
      "Separate recommendation from commitment. A suggestion is fine; a commitment needs approval.",
      "Surface uncertainty when required facts are missing."
    ]
  },
  {
    id: "calendar",
    title: "Calendar Availability",
    category: "productivity",
    summary: "Use availability windows and intentionally shared calendar details.",
    structuredFacts: ["calendar busy blocks", "calendar events with visibility controls"],
    allowedActions: ["Reason about free/busy windows", "Suggest meeting times", "Explain schedule conflicts"],
    approvalRequired: ["Creating calendar events", "Editing calendar events", "Sharing event titles or details"],
    promptGuidance: [
      "Default to free/busy reasoning. Do not infer private event titles from blocked time.",
      "Only use title or full event detail when Atlas marks that visibility as shared.",
      "Ask for approval before any calendar write or schedule commitment."
    ]
  },
  {
    id: "reminders",
    title: "Reminders",
    category: "productivity",
    summary: "Propose and track reminders while the iOS bridge owns local Apple Reminders writes.",
    structuredFacts: ["reminders", "approvals"],
    allowedActions: ["Draft reminder text", "Suggest due dates", "Summarize open reminders"],
    approvalRequired: ["Creating reminders", "Editing reminders", "Completing or cancelling reminders"],
    promptGuidance: [
      "Treat reminder writes as proposed actions until an approval is accepted.",
      "Keep reminder titles concise and specific.",
      "Use the iOS bridge as the execution path for Apple Reminders."
    ]
  },
  {
    id: "health",
    title: "Health Summary",
    category: "wellness",
    summary: "Use summarized HealthKit-derived metrics for non-diagnostic coaching and context.",
    structuredFacts: ["health daily summaries", "workout summaries", "sleep minutes", "active energy"],
    allowedActions: ["Summarize trends", "Relate workouts to recovery context", "Suggest conservative wellness habits"],
    approvalRequired: ["Sharing health facts outside the user's workspace", "Changing health or fitness goals"],
    promptGuidance: [
      "Do not diagnose, prescribe treatment, or overstate precision from consumer health data.",
      "Respect per-type HealthKit authorization. Missing data may mean not shared, not zero.",
      "Prefer trends and ranges over false precision."
    ]
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
    approvalRequired: ["Changing training goals", "Committing another user to a session", "Sharing training details outside the user's workspace"],
    promptGuidance: [
      "Use workout, sleep, energy, and schedule context together instead of treating one metric as decisive.",
      "Treat planned workouts and performed sets as structured facts, not memory.",
      "Keep recommendations conservative when recovery or injury context is unclear.",
      "If location confidence is low, ask a clarifying question before assuming the user is at the gym."
    ]
  },
  {
    id: "nutrition",
    title: "Nutrition Intake",
    category: "wellness",
    summary: "Use calorie, macro, hydration, meal, and confidence facts without running a full food database server.",
    structuredFacts: ["nutrition daily summaries", "nutrition meal entries", "source confidence"],
    allowedActions: ["Summarize intake", "Compare intake to user goals", "Suggest simple habit changes"],
    approvalRequired: ["Sharing nutrition facts outside the user's workspace", "Changing nutrition goals"],
    promptGuidance: [
      "Use source and confidence fields when discussing intake quality.",
      "Avoid rigid diet prescriptions. Give practical, science-backed, non-medical guidance.",
      "Ask for clarification when meal estimates are low-confidence or incomplete."
    ]
  },
  {
    id: "location",
    title: "Semantic Location",
    category: "context",
    summary: "Use coarse semantic place signals such as home, work, gym, school, or unknown.",
    structuredFacts: ["location signals"],
    allowedActions: ["Reason about current context", "Adapt reminders or suggestions to coarse place"],
    approvalRequired: ["Sharing location context outside the user's workspace"],
    promptGuidance: [
      "Never claim raw coordinates or location history. Atlas stores semantic place labels only.",
      "Use confidence before making context-sensitive suggestions.",
      "If a location signal conflicts with calendar context, ask or present both possibilities."
    ]
  },
  {
    id: "memory",
    title: "Honcho Memory",
    category: "memory",
    summary: "Use the configured Honcho workspace while respecting Atlas memory isolation.",
    structuredFacts: ["honcho workspace id", "shared memory grants"],
    allowedActions: ["Use workspace memory for preferences", "Summarize remembered preferences"],
    approvalRequired: ["Copying personal memory into a shared workspace", "Using revoked shared memory"],
    promptGuidance: [
      "Use only the Honcho workspace configured for this agent.",
      "Do not merge personal and shared memory unless Atlas records an active grant.",
      "Keep structured facts in PostgreSQL as the source of truth when they conflict with memory."
    ]
  },
  {
    id: "whatsapp",
    title: "WhatsApp Messaging",
    category: "channel",
    summary: "Adapt responses for the WhatsApp channel and its allowlisted identity model.",
    structuredFacts: ["identity channels", "inbound messages", "outbound messages", "audit logs"],
    allowedActions: ["Reply to authorized senders", "Use configured shared-agent aliases"],
    approvalRequired: ["Messaging another user proactively", "Sharing private facts in a group or shared context"],
    promptGuidance: [
      "Keep WhatsApp replies concise and scannable.",
      "Assume Atlas has already authenticated the sender, but do not reveal private data without the right workspace context.",
      "When a request should go to a shared agent, respect configured aliases and memberships."
    ]
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

export function skillManifestForIds(skillIds: string[]): Array<Omit<AtlasSkill, "promptGuidance">> {
  return resolveSkills(skillIds).map(({ promptGuidance: _promptGuidance, ...skill }) => skill);
}

export function renderSkillPrompt(skillIds: string[]): string {
  const skills = resolveSkills(skillIds);
  if (skills.length === 0) {
    return "";
  }

  return [
    "## Atlas Baked-In Skills",
    "",
    "Enabled skills are capability contracts. They describe what this agent may reason about. Atlas still enforces identity, user scope, memory boundaries, and approvals in code.",
    "",
    ...skills.flatMap((skill) => [
      `### ${skill.title} (${skill.id})`,
      skill.summary,
      "",
      "Use:",
      ...skill.promptGuidance.map((guidance) => `- ${guidance}`),
      "",
      skill.approvalRequired.length > 0
        ? `Approval required before: ${skill.approvalRequired.join("; ")}.`
        : "No write action is granted by this skill.",
      ""
    ])
  ]
    .join("\n")
    .trimEnd();
}
