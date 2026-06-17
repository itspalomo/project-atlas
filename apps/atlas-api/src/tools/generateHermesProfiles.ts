import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import yaml from "js-yaml";
import { loadConfig } from "../config.js";
import {
  agentHermesProfile,
  agentHonchoWorkspace,
  agentRuntimeGroup,
  ecosystemRuntimeGroups,
  EcosystemAgent,
  EcosystemRuntimeGroup,
  loadEcosystemConfig
} from "../ecosystem/ecosystemConfig.js";
import { renderAtlasCapabilitySkill, skillManifestForIds } from "../skills/skillCatalog.js";

type Args = {
  outDir: string;
  homeDir?: string;
};

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const config = loadConfig();
  const ecosystem = await loadEcosystemConfig(config.ecosystemConfigPath);
  const outDir = path.resolve(process.cwd(), args.outDir);
  const homeDir = path.resolve(process.cwd(), args.homeDir ?? path.dirname(outDir));

  await mkdir(outDir, { recursive: true });
  await mkdir(homeDir, { recursive: true });

  const runtimeGroups = ecosystemRuntimeGroups(ecosystem);
  const agentsByRuntimeGroup = agentsGroupedByRuntimeGroup(ecosystem.agents);
  const manifest = {
    project: ecosystem.project,
    honchoBaseUrl: config.honcho?.baseUrl ?? "http://honcho-api:8000",
    runtimeGroups: runtimeGroups.map((group) => ({
      ...group,
      service: runtimeGroupServiceName(group.id),
      home: runtimeGroupHomePath(group.id),
      profilesDir: `${runtimeGroupHomePath(group.id)}/profiles`,
      agents: agentsByRuntimeGroup.get(group.id)?.map((agent) => agent.id) ?? []
    })),
    profiles: ecosystem.agents.map((agent) => ({
      id: agent.id,
      displayName: agent.displayName,
      runtimeGroup: agentRuntimeGroup(agent),
      hermesProfile: agentHermesProfile(agent),
      honchoWorkspace: agentHonchoWorkspace(agent),
      capabilities: agent.skills,
      whatsappAllowedUsers: agentWhatsAppAllowedUsers(ecosystem, agent)
    }))
  };

  for (const agent of ecosystem.agents) {
    const runtimeGroup = agentRuntimeGroup(agent);
    const profile = agentHermesProfile(agent);
    const groupHomeDir = runtimeGroupHomeDir(homeDir, runtimeGroup);
    const profileDir = path.join(groupHomeDir, "profiles", profile);
    const honchoWorkspace = agentHonchoWorkspace(agent);
    const skillManifest = skillManifestForIds(agent.skills);
    const allowedWhatsAppUsers = agentWhatsAppAllowedUsers(ecosystem, agent);
    const honchoHosts = hermesHonchoHosts(profile, {
      aiPeer: agent.id,
      peerName: ecosystem.project.id,
      workspace: honchoWorkspace
    });

    await mkdir(profileDir, { recursive: true });
    await mergeProfileConfig(path.join(profileDir, "config.yaml"));
    await upsertProfileEnv(path.join(profileDir, ".env"), allowedWhatsAppUsers);
    const skillDir = path.join(profileDir, "skills", "atlas-context");
    await mkdir(skillDir, { recursive: true });
    await writeFile(path.join(skillDir, "SKILL.md"), `${renderAtlasCapabilitySkill(agent.skills)}\n`, "utf8");
    await writeFile(
      path.join(profileDir, "atlas-capabilities.json"),
      `${JSON.stringify(
        {
          agentId: agent.id,
          capabilities: skillManifest,
          enforcement: {
            identity: "Hermes gateway allowlists generated from Atlas ecosystem config",
            approvals: "Atlas API",
            memory: "Hermes Honcho memory provider with Atlas-generated profile-local honcho.json",
            customData: "Hermes MCP server mcp_atlas_atlas_get_context backed by Atlas API",
            bridgeWrites: "iOS bridge scoped device tokens and Atlas approvals"
          }
        },
        null,
        2
      )}\n`,
      "utf8"
    );
    await writeFile(
      path.join(profileDir, "honcho.json"),
      `${JSON.stringify(
        {
          baseUrl: config.honcho?.baseUrl ?? "http://honcho-api:8000",
          apiKey: config.honcho?.apiKey || undefined,
          hosts: honchoHosts
        },
        null,
        2
      )}\n`,
      "utf8"
    );
  }

  await writeFile(
    path.join(homeDir, "compose.runtime.yaml"),
    yaml.dump(renderRuntimeCompose(runtimeGroups, agentsByRuntimeGroup), { noRefs: true, lineWidth: 120 }),
    "utf8"
  );
  await writeFile(path.join(homeDir, "atlas-runtime-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await writeFile(path.join(outDir, "atlas-profiles.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(`Generated ${ecosystem.agents.length} Hermes profile(s) across ${runtimeGroups.length} runtime group(s) in ${homeDir}`);
}

function agentsGroupedByRuntimeGroup(agents: EcosystemAgent[]): Map<string, EcosystemAgent[]> {
  const groups = new Map<string, EcosystemAgent[]>();

  for (const agent of agents) {
    const runtimeGroup = agentRuntimeGroup(agent);
    groups.set(runtimeGroup, [...(groups.get(runtimeGroup) ?? []), agent]);
  }

  return groups;
}

function runtimeGroupHomeDir(homeDir: string, runtimeGroup: string): string {
  return runtimeGroup === "default" ? homeDir : path.join(homeDir, "runtime-groups", runtimeGroup);
}

function runtimeGroupHomePath(runtimeGroup: string): string {
  return runtimeGroup === "default" ? "data/hermes" : `data/hermes/runtime-groups/${runtimeGroup}`;
}

function runtimeGroupServiceName(runtimeGroup: string): string {
  return runtimeGroup === "default" ? "hermes" : `hermes-${runtimeGroup}`;
}

function renderRuntimeCompose(
  runtimeGroups: EcosystemRuntimeGroup[],
  agentsByRuntimeGroup: Map<string, EcosystemAgent[]>
): Record<string, unknown> {
  const services: Record<string, unknown> = {};
  const defaultGroupHasAgents = (agentsByRuntimeGroup.get("default") ?? []).length > 0;

  if (!defaultGroupHasAgents) {
    services.hermes = {
      profiles: ["atlas-disabled"]
    };
  }

  for (const group of runtimeGroups) {
    if ((agentsByRuntimeGroup.get(group.id) ?? []).length === 0) {
      continue;
    }

    if (group.id === "default") {
      const defaultOverride = renderDefaultRuntimeService(group);
      if (Object.keys(defaultOverride).length > 0) {
        services.hermes = defaultOverride;
      }
      continue;
    }

    services[runtimeGroupServiceName(group.id)] = renderRuntimeService(group);
  }

  return {
    services
  };
}

function renderDefaultRuntimeService(group: EcosystemRuntimeGroup): Record<string, unknown> {
  const ports = runtimeGroupPorts(group);

  return ports.length > 0 ? { ports } : {};
}

function renderRuntimeService(group: EcosystemRuntimeGroup): Record<string, unknown> {
  const service: Record<string, unknown> = {
    image: "nousresearch/hermes-agent:latest",
    restart: "unless-stopped",
    command: "gateway run",
    env_file: [
      {
        path: ".env",
        required: false
      }
    ],
    environment: {
      HERMES_HOME: "/opt/data",
      HONCHO_BASE_URL: "${HONCHO_BASE_URL:-http://honcho-api:8000}",
      HONCHO_API_KEY: "${HONCHO_API_KEY:-}"
    },
    depends_on: {
      "honcho-api": {
        condition: "service_healthy"
      }
    },
    volumes: [`./${runtimeGroupHomePath(group.id)}:/opt/data`],
    security_opt: ["no-new-privileges:true"],
    profiles: ["runtime"]
  };
  const ports = runtimeGroupPorts(group);

  if (ports.length > 0) {
    service.ports = ports;
  }

  return service;
}

function runtimeGroupPorts(group: EcosystemRuntimeGroup): string[] {
  const ports: string[] = [];

  if (group.ports.dashboard) {
    ports.push(`127.0.0.1:${group.ports.dashboard}:9119`);
  }
  if (group.ports.gateway) {
    ports.push(`127.0.0.1:${group.ports.gateway}:8642`);
  }
  if (group.ports.whatsappCloudWebhook) {
    ports.push(`127.0.0.1:${group.ports.whatsappCloudWebhook}:8090`);
  }

  return ports;
}

function agentWhatsAppAllowedUsers(
  ecosystem: Awaited<ReturnType<typeof loadEcosystemConfig>>,
  agent: Awaited<ReturnType<typeof loadEcosystemConfig>>["agents"][number]
): string[] {
  const allowedUserIds = new Set([
    ...agent.owners,
    ...agent.members,
    ...ecosystem.users
      .filter((user) => user.identities.some((identity) => identity.enabled && identity.defaultAgent === agent.id))
      .map((user) => user.id)
  ]);
  const allowedUsers = new Set<string>();

  for (const user of ecosystem.users) {
    if (!allowedUserIds.has(user.id)) {
      continue;
    }

    for (const identity of user.identities) {
      if (identity.channel !== "whatsapp" || !identity.enabled) {
        continue;
      }

      const normalized = normalizeWhatsAppUser(identity.externalId);
      if (normalized) {
        allowedUsers.add(normalized);
      }
    }
  }

  return [...allowedUsers].sort();
}

function normalizeWhatsAppUser(externalId: string): string {
  return externalId.replace(/\D/g, "");
}

async function mergeProfileConfig(configPath: string): Promise<void> {
  const existing = await readYamlObject(configPath);
  const atlasManagedConfig = {
    whatsapp: {
      unauthorized_dm_behavior: "ignore"
    },
    memory: {
      provider: "honcho",
      memory_enabled: true,
      user_profile_enabled: true
    },
    mcp_servers: {
      atlas: {
        url: "${ATLAS_MCP_URL}",
        headers: {
          Authorization: "Bearer ${ATLAS_MCP_KEY}"
        },
        tools: {
          include: ["atlas_get_context"],
          prompts: false,
          resources: false
        }
      }
    }
  };
  const merged = deepMerge(existing, atlasManagedConfig);

  await writeFile(configPath, yaml.dump(merged, { noRefs: true, lineWidth: 120 }), "utf8");
}

async function readYamlObject(filePath: string): Promise<Record<string, unknown>> {
  let raw: string;

  try {
    raw = await readFile(filePath, "utf8");
  } catch (error) {
    if (isNotFound(error)) {
      return {};
    }
    throw error;
  }

  const parsed = yaml.load(raw);
  if (parsed === undefined || parsed === null) {
    return {};
  }
  if (!isPlainObject(parsed)) {
    throw new Error(`${filePath} must contain a YAML mapping before Atlas can merge profile settings`);
  }

  return parsed;
}

function deepMerge(base: Record<string, unknown>, override: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = { ...base };

  for (const [key, value] of Object.entries(override)) {
    const existing = next[key];
    next[key] =
      isPlainObject(existing) && isPlainObject(value)
        ? deepMerge(existing, value)
        : value;
  }

  return next;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function upsertProfileEnv(envPath: string, allowedWhatsAppUsers: string[]): Promise<void> {
  const existing = await readTextFile(envPath);
  const withoutExistingManagedBlock = existing.replace(
    /\n?# BEGIN ATLAS MANAGED WHATSAPP ALLOWLIST[\s\S]*?# END ATLAS MANAGED WHATSAPP ALLOWLIST\n?/g,
    "\n"
  );
  const unmanagedLines = withoutExistingManagedBlock
    .split(/\r?\n/)
    .filter((line) => !/^\s*(?:export\s+)?(?:WHATSAPP_ALLOWED_USERS|WHATSAPP_CLOUD_ALLOWED_USERS)\s*=/.test(line));
  const unmanagedContent = unmanagedLines.join("\n").trimEnd();
  const managedBlock = renderProfileEnvBlock(allowedWhatsAppUsers);
  const nextContent = unmanagedContent.length > 0 ? `${unmanagedContent}\n\n${managedBlock}\n` : `${managedBlock}\n`;

  await writeFile(envPath, nextContent, "utf8");
}

async function readTextFile(filePath: string): Promise<string> {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if (isNotFound(error)) {
      return "";
    }
    throw error;
  }
}

function isNotFound(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

function renderProfileEnvBlock(allowedWhatsAppUsers: string[]): string {
  const lines = [
    "# BEGIN ATLAS MANAGED WHATSAPP ALLOWLIST",
    "# Generated by Atlas from ecosystem/atlas.yaml. Other Hermes credentials in this file are preserved."
  ];

  if (allowedWhatsAppUsers.length > 0) {
    const allowlist = allowedWhatsAppUsers.join(",");
    lines.push("# Hermes WhatsApp gateway allowlists. Phone numbers use country code digits without '+'.");
    lines.push(`WHATSAPP_ALLOWED_USERS=${allowlist}`);
    lines.push(`WHATSAPP_CLOUD_ALLOWED_USERS=${allowlist}`);
  } else {
    lines.push("# No WhatsApp identities are configured for this profile; Hermes should deny inbound WhatsApp by default.");
    lines.push("WHATSAPP_ALLOWED_USERS=");
    lines.push("WHATSAPP_CLOUD_ALLOWED_USERS=");
  }

  lines.push("# END ATLAS MANAGED WHATSAPP ALLOWLIST");

  return lines.join("\n");
}

type HonchoHostConfig = {
  enabled: true;
  aiPeer: string;
  peerName: string;
  workspace: string;
};

function hermesHonchoHosts(profile: string, host: Omit<HonchoHostConfig, "enabled">): Record<string, HonchoHostConfig> {
  const config = { enabled: true, ...host } satisfies HonchoHostConfig;
  const profileHostKey = profile === "default" || profile === "hermes" ? "hermes" : `hermes.${profile}`;

  return profileHostKey === "hermes" ? { hermes: config } : { hermes: config, [profileHostKey]: config };
}

function parseArgs(argv: string[]): Args {
  const outIndex = argv.indexOf("--out");
  const outDir = outIndex === -1 ? undefined : argv[outIndex + 1];
  const homeIndex = argv.indexOf("--home");
  const homeDir = homeIndex === -1 ? undefined : argv[homeIndex + 1];

  return { outDir: outDir ?? "data/hermes/profiles", homeDir };
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
