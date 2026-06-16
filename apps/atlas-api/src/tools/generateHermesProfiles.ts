import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadConfig } from "../config.js";
import {
  agentHermesProfile,
  agentHonchoWorkspace,
  agentPrompt,
  loadEcosystemConfig
} from "../ecosystem/ecosystemConfig.js";

type Args = {
  outDir: string;
};

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const config = loadConfig();
  const ecosystem = await loadEcosystemConfig(config.ecosystemConfigPath);
  const outDir = path.resolve(process.cwd(), args.outDir);

  await mkdir(outDir, { recursive: true });

  const manifest = {
    project: ecosystem.project,
    honchoBaseUrl: config.honcho?.baseUrl ?? "http://honcho-api:8000",
    profiles: ecosystem.agents.map((agent) => ({
      id: agent.id,
      displayName: agent.displayName,
      hermesProfile: agentHermesProfile(agent),
      honchoWorkspace: agentHonchoWorkspace(agent)
    }))
  };
  const desiredProfiles = new Set(manifest.profiles.map((profile) => profile.hermesProfile));

  await removeStaleProfiles(outDir, desiredProfiles);

  for (const agent of ecosystem.agents) {
    const profile = agentHermesProfile(agent);
    const profileDir = path.join(outDir, profile);
    const honchoWorkspace = agentHonchoWorkspace(agent);

    await rm(profileDir, { recursive: true, force: true });
    await mkdir(profileDir, { recursive: true });
    await writeFile(path.join(profileDir, "SOUL.md"), `${agentPrompt(agent)}\n`, "utf8");
    await writeFile(
      path.join(profileDir, "honcho.json"),
      `${JSON.stringify(
        {
          baseUrl: config.honcho?.baseUrl ?? "http://honcho-api:8000",
          apiKey: config.honcho?.apiKey || undefined,
          hosts: {
            hermes: {
              enabled: true,
              aiPeer: agent.id,
              peerName: ecosystem.project.id,
              workspace: honchoWorkspace
            }
          }
        },
        null,
        2
      )}\n`,
      "utf8"
    );
  }

  await writeFile(path.join(outDir, "atlas-profiles.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(`Generated ${ecosystem.agents.length} Hermes profile(s) in ${outDir}`);
}

async function removeStaleProfiles(outDir: string, desiredProfiles: Set<string>): Promise<void> {
  const manifestPath = path.join(outDir, "atlas-profiles.json");
  const previousProfiles = await readPreviousProfiles(manifestPath);

  for (const profile of previousProfiles) {
    if (!desiredProfiles.has(profile)) {
      await rm(path.join(outDir, profile), { recursive: true, force: true });
    }
  }
}

async function readPreviousProfiles(manifestPath: string): Promise<string[]> {
  try {
    const raw = await readFile(manifestPath, "utf8");
    const parsed = JSON.parse(raw) as {
      profiles?: Array<{ hermesProfile?: unknown }>;
    };

    return (
      parsed.profiles
        ?.map((profile) => profile.hermesProfile)
        .filter((profile): profile is string => typeof profile === "string" && profile.length > 0) ?? []
    );
  } catch {
    return [];
  }
}

function parseArgs(argv: string[]): Args {
  const outIndex = argv.indexOf("--out");
  const outDir = outIndex === -1 ? undefined : argv[outIndex + 1];
  if (!outDir) {
    return { outDir: "data/hermes/profiles" };
  }

  return { outDir };
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
