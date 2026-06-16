import { access, readFile } from "node:fs/promises";
import path from "node:path";
import yaml from "js-yaml";
import { z } from "zod";

const identitySchema = z.object({
  channel: z.enum(["whatsapp"]),
  externalId: z.string().min(1),
  defaultAgent: z.string().min(1).optional(),
  enabled: z.boolean().default(true)
});

const userSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1),
  kind: z.enum(["person", "family"]).default("person"),
  identities: z.array(identitySchema).default([])
});

const routingSchema = z
  .object({
    defaultFor: z.array(z.string().min(1)).default([]),
    aliases: z.array(z.string().min(1)).default([])
  })
  .default({ defaultFor: [], aliases: [] });

const runtimeSchema = z
  .object({
    url: z.string().url().optional()
  })
  .default({});

const agentSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1),
  type: z.enum(["personal", "shared"]).default("shared"),
  hermesProfile: z.string().min(1).optional(),
  honchoWorkspace: z.string().min(1).optional(),
  owners: z.array(z.string().min(1)).default([]),
  members: z.array(z.string().min(1)).default([]),
  skills: z.array(z.string().min(1)).default([]),
  routing: routingSchema,
  runtime: runtimeSchema,
  prompt: z.string().min(1).optional()
});

const ecosystemSchema = z.object({
  version: z.literal(1),
  project: z
    .object({
      id: z.string().min(1).default("atlas"),
      name: z.string().min(1).default("Project Atlas")
    })
    .default({ id: "atlas", name: "Project Atlas" }),
  users: z.array(userSchema).min(1),
  agents: z.array(agentSchema).min(1)
});

export type EcosystemConfig = z.infer<typeof ecosystemSchema>;
export type EcosystemAgent = EcosystemConfig["agents"][number];

export async function loadEcosystemConfig(configPath: string): Promise<EcosystemConfig> {
  const resolved = await resolveConfigPath(configPath);
  const raw = await readFile(resolved, "utf8");
  const config = ecosystemSchema.parse(yaml.load(raw));

  validateUnique(config.users.map((user) => user.id), "user id");
  validateUnique(config.agents.map((agent) => agent.id), "agent id");

  const userIds = new Set(config.users.map((user) => user.id));
  const agentIds = new Set(config.agents.map((agent) => agent.id));

  for (const agent of config.agents) {
    for (const userId of [...agent.owners, ...agent.members, ...agent.routing.defaultFor]) {
      if (!userIds.has(userId)) {
        throw new Error(`Agent ${agent.id} references unknown user ${userId}`);
      }
    }
  }

  for (const user of config.users) {
    for (const identity of user.identities) {
      if (identity.defaultAgent && !agentIds.has(identity.defaultAgent)) {
        throw new Error(`User ${user.id} identity references unknown default agent ${identity.defaultAgent}`);
      }
    }
  }

  return config;
}

async function resolveConfigPath(configPath: string): Promise<string> {
  if (path.isAbsolute(configPath)) {
    return configPath;
  }

  let current = process.cwd();

  while (true) {
    const candidate = path.join(current, configPath);
    if (await pathExists(candidate)) {
      return candidate;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return path.resolve(process.cwd(), configPath);
    }

    current = parent;
  }
}

async function pathExists(candidate: string): Promise<boolean> {
  try {
    await access(candidate);
    return true;
  } catch {
    return false;
  }
}

export function agentHermesProfile(agent: EcosystemAgent): string {
  return agent.hermesProfile ?? agent.id;
}

export function agentHonchoWorkspace(agent: EcosystemAgent): string {
  return agent.honchoWorkspace ?? agent.id;
}

export function agentPrompt(agent: EcosystemAgent): string {
  if (agent.prompt) {
    return agent.prompt.trimEnd();
  }

  return [
    `# ${agent.displayName}`,
    "",
    `You are ${agent.displayName}, a private Project Atlas agent.`,
    "",
    "Project Atlas owns identity, permissions, approvals, and memory boundaries.",
    "Use structured Atlas facts as the source of truth for health, calendar, reminders, approvals, and audit data.",
    "Ask for approval before creating reminders, modifying calendars, changing goals, or sharing information outside this workspace.",
    "",
    agent.type === "shared"
      ? "This is a shared agent. Use only information intentionally shared into this workspace or structured shared facts exposed by Atlas."
      : "This is a personal agent. Keep this user's memory private unless the user explicitly shares something."
  ].join("\n");
}

function validateUnique(values: string[], label: string): void {
  const seen = new Set<string>();

  for (const value of values) {
    if (seen.has(value)) {
      throw new Error(`Duplicate ${label}: ${value}`);
    }

    seen.add(value);
  }
}
