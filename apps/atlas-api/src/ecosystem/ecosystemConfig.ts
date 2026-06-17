import { access, readFile } from "node:fs/promises";
import path from "node:path";
import yaml from "js-yaml";
import { z } from "zod";
import { validateSkillIds } from "../skills/skillCatalog.js";

const slugSchema = z.string().min(1).regex(/^[a-z0-9][a-z0-9_-]*$/);

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

const runtimeGroupSchema = z.object({
  id: slugSchema,
  displayName: z.string().min(1).optional(),
  isolation: z.enum(["container"]).default("container"),
  ports: z
    .object({
      dashboard: z.number().int().positive().optional(),
      gateway: z.number().int().positive().optional(),
      webhook: z.number().int().positive().optional()
    })
    .default({})
});

const agentSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1),
  type: z.enum(["personal", "shared"]).default("shared"),
  runtimeGroup: slugSchema.optional(),
  hermesProfile: z.string().min(1).optional(),
  honchoWorkspace: z.string().min(1).optional(),
  owners: z.array(z.string().min(1)).default([]),
  members: z.array(z.string().min(1)).default([]),
  skills: z.array(z.string().min(1)).default([])
});

const ecosystemSchema = z.object({
  version: z.literal(1),
  project: z
    .object({
      id: z.string().min(1).default("atlas"),
      name: z.string().min(1).default("Project Atlas")
    })
    .default({ id: "atlas", name: "Project Atlas" }),
  runtimeGroups: z.array(runtimeGroupSchema).default([]),
  users: z.array(userSchema).min(1),
  agents: z.array(agentSchema).min(1)
});

export type EcosystemConfig = z.infer<typeof ecosystemSchema>;
export type EcosystemAgent = EcosystemConfig["agents"][number];
export type EcosystemRuntimeGroup = ReturnType<typeof ecosystemRuntimeGroups>[number];

const defaultRuntimeGroup = {
  id: "default",
  displayName: "Default Hermes Runtime",
  isolation: "container",
  ports: {}
} as const;

export async function loadEcosystemConfig(configPath: string): Promise<EcosystemConfig> {
  const resolved = await resolveConfigPath(configPath);
  const raw = await readFile(resolved, "utf8");
  const config = ecosystemSchema.parse(yaml.load(raw));

  validateUnique(config.users.map((user) => user.id), "user id");
  validateUnique(config.agents.map((agent) => agent.id), "agent id");
  validateUnique(ecosystemRuntimeGroups(config).map((group) => group.id), "runtime group id");

  const userIds = new Set(config.users.map((user) => user.id));
  const agentIds = new Set(config.agents.map((agent) => agent.id));
  const agentsById = new Map(config.agents.map((agent) => [agent.id, agent]));
  const runtimeGroupIds = new Set(ecosystemRuntimeGroups(config).map((group) => group.id));

  for (const agent of config.agents) {
    validateSkillIds(agent.skills, `Agent ${agent.id}`);

    const runtimeGroup = agentRuntimeGroup(agent);
    if (!runtimeGroupIds.has(runtimeGroup)) {
      throw new Error(`Agent ${agent.id} references unknown runtime group ${runtimeGroup}`);
    }

    for (const userId of [...agent.owners, ...agent.members]) {
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
      if (identity.defaultAgent) {
        const agent = agentsById.get(identity.defaultAgent);
        if (agent && !agent.owners.includes(user.id) && !agent.members.includes(user.id)) {
          throw new Error(`User ${user.id} identity default agent ${identity.defaultAgent} does not include that user as an owner or member`);
        }
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

export function agentRuntimeGroup(agent: EcosystemAgent): string {
  return agent.runtimeGroup ?? defaultRuntimeGroup.id;
}

export function ecosystemRuntimeGroups(config: EcosystemConfig): Array<{
  id: string;
  displayName?: string;
  isolation: "container";
  ports: {
    dashboard?: number;
    gateway?: number;
    webhook?: number;
  };
}> {
  return config.runtimeGroups.length > 0 ? config.runtimeGroups : [defaultRuntimeGroup];
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
