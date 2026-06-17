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
      capabilities: agent.skills
    }))
  };

  for (const agent of ecosystem.agents) {
    const runtimeGroup = agentRuntimeGroup(agent);
    const profile = agentHermesProfile(agent);
    const groupHomeDir = runtimeGroupHomeDir(homeDir, runtimeGroup);
    const profileDir = path.join(groupHomeDir, "profiles", profile);
    const honchoWorkspace = agentHonchoWorkspace(agent);
    const skillManifest = skillManifestForIds(agent.skills);
    const honchoHosts = hermesHonchoHosts(profile, {
      aiPeer: agent.id,
      peerName: ecosystem.project.id,
      workspace: honchoWorkspace
    });

    await mkdir(profileDir, { recursive: true });
    await mergeProfileConfig(path.join(profileDir, "config.yaml"));
    await removeLegacyAtlasEnvBlock(path.join(profileDir, ".env"));
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
            identity: "Atlas agent membership and bridge scopes; Hermes owns messaging identities and channel authorization",
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

  for (const group of runtimeGroups) {
    if ((agentsByRuntimeGroup.get(group.id) ?? []).length === 0) {
      continue;
    }

    services[runtimeGroupServiceName(group.id)] = renderRuntimeService(group);
  }

  return {
    services
  };
}

function renderRuntimeService(group: EcosystemRuntimeGroup): Record<string, unknown> {
  const service: Record<string, unknown> = {
    image: "nousresearch/hermes-agent:latest",
    restart: "unless-stopped",
    command: "gateway run",
    environment: {
      HERMES_HOME: "/opt/data",
      HONCHO_BASE_URL: "${HONCHO_BASE_URL:-http://honcho-api:8000}",
      HONCHO_API_KEY: "${HONCHO_API_KEY:-}",
      ATLAS_MCP_URL: "${ATLAS_MCP_URL:-http://atlas-api:3000/mcp}",
      ATLAS_MCP_KEY: "${ATLAS_MCP_KEY:-}"
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
  const dashboardPort = group.ports.dashboard
    ? String(group.ports.dashboard)
    : group.id === "default"
      ? "${HERMES_DASHBOARD_PORT:-9119}"
      : undefined;
  const gatewayPort = group.ports.gateway
    ? String(group.ports.gateway)
    : group.id === "default"
      ? "${HERMES_GATEWAY_PORT:-8642}"
      : undefined;
  const webhookPort = group.ports.webhook
    ? String(group.ports.webhook)
    : group.id === "default"
      ? "${HERMES_WEBHOOK_PORT:-8090}"
      : undefined;

  if (dashboardPort) {
    ports.push(`127.0.0.1:${dashboardPort}:9119`);
  }
  if (gatewayPort) {
    ports.push(`127.0.0.1:${gatewayPort}:8642`);
  }
  if (webhookPort) {
    ports.push(`127.0.0.1:${webhookPort}:8090`);
  }

  return ports;
}

async function mergeProfileConfig(configPath: string): Promise<void> {
  const existing = await readYamlObject(configPath);
  const atlasManagedConfig = {
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

async function removeLegacyAtlasEnvBlock(envPath: string): Promise<void> {
  const existing = await readTextFile(envPath);
  if (!existing) {
    return;
  }

  const nextContent = existing.replace(
    /\n?# BEGIN ATLAS MANAGED WHATSAPP ALLOWLIST[\s\S]*?# END ATLAS MANAGED WHATSAPP ALLOWLIST\n?/g,
    "\n"
  ).trimEnd();

  if (nextContent !== existing.trimEnd()) {
    await writeFile(envPath, nextContent.length > 0 ? `${nextContent}\n` : "", "utf8");
  }
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
