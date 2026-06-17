import { createPool } from "./pool.js";
import { normalizePhoneNumber } from "../identity/phone.js";
import { loadConfig } from "../config.js";
import { agentHermesProfile, agentHonchoWorkspace, agentRuntimeGroup, loadEcosystemConfig } from "../ecosystem/ecosystemConfig.js";
import { skillManifestForIds } from "../skills/skillCatalog.js";

const supportedIdentityChannels = ["whatsapp"] as const;

async function main(): Promise<void> {
  const config = loadConfig();
  const pool = createPool();
  const ecosystem = await loadEcosystemConfig(config.ecosystemConfigPath);
  const configuredUserIds = ecosystem.users.map((user) => user.id);

  const client = await pool.connect();
  try {
    await client.query("begin");

    for (const user of ecosystem.users) {
      await client.query(
        `
          insert into users (id, display_name, kind)
          values ($1, $2, $3)
          on conflict (id)
          do update set
            display_name = excluded.display_name,
            kind = excluded.kind,
            updated_at = now()
        `,
        [user.id, user.displayName, user.kind]
      );
    }

    await client.query(
      `
        update identity_channels
        set is_enabled = false,
            updated_at = now()
        where not (user_id = any($1::text[]))
      `,
      [configuredUserIds]
    );

    for (const agent of ecosystem.agents) {
      const hermesProfile = agentHermesProfile(agent);
      const honchoWorkspace = agentHonchoWorkspace(agent);
      const skillManifest = skillManifestForIds(agent.skills);
      const memberships = desiredMembershipsForAgent(agent);
      const membershipUserIds = [...memberships.keys()];

      await client.query(
        `
          insert into agents (
            id,
            display_name,
            agent_type,
            hermes_profile,
            honcho_workspace,
            config
          )
          values ($1, $2, $3, $4, $5, $6::jsonb)
          on conflict (id)
          do update set
            display_name = excluded.display_name,
            agent_type = excluded.agent_type,
            hermes_profile = excluded.hermes_profile,
            honcho_workspace = excluded.honcho_workspace,
            config = excluded.config,
            updated_at = now()
        `,
        [
          agent.id,
          agent.displayName,
          agent.type,
          hermesProfile,
          honchoWorkspace,
          JSON.stringify({
            runtimeGroup: agentRuntimeGroup(agent),
            skills: agent.skills,
            skillManifest
          })
        ]
      );

      await client.query(
        `
          delete from agent_memberships
          where agent_id = $1
            and not (user_id = any($2::text[]))
        `,
        [agent.id, membershipUserIds]
      );

      for (const [userId, role] of memberships) {
        await client.query(
          `
            insert into agent_memberships (agent_id, user_id, role)
            values ($1, $2, $3)
            on conflict (agent_id, user_id)
            do update set role = excluded.role
          `,
          [agent.id, userId, role]
        );
      }
    }

    for (const user of ecosystem.users) {
      const desiredIdentityIdsByChannel = desiredIdentityExternalIdsByChannel(user.identities);

      for (const channel of supportedIdentityChannels) {
        await client.query(
          `
            update identity_channels
            set is_enabled = false,
                updated_at = now()
            where user_id = $1
              and channel = $2
              and not (external_id = any($3::text[]))
          `,
          [user.id, channel, desiredIdentityIdsByChannel.get(channel) ?? []]
        );
      }

      for (const identity of user.identities) {
        const defaultAgentId = identity.defaultAgent ?? findDefaultAgentForUser(ecosystem.agents, user.id)?.id;
        if (!defaultAgentId) {
          throw new Error(`No default agent could be resolved for user ${user.id} ${identity.channel} identity`);
        }

        await client.query(
          `
            insert into identity_channels (user_id, channel, external_id, agent_id, is_enabled)
            values ($1, $2, $3, $4, $5)
            on conflict (channel, external_id)
            do update set
              user_id = excluded.user_id,
              agent_id = excluded.agent_id,
              is_enabled = excluded.is_enabled,
              updated_at = now()
          `,
          [
            user.id,
            identity.channel,
            identity.channel === "whatsapp" ? normalizePhoneNumber(identity.externalId) : identity.externalId,
            defaultAgentId,
            identity.enabled
          ]
        );
      }
    }

    await client.query("commit");
    console.log("Seeded Project Atlas identities and agents.");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

type SeedAgent = Awaited<ReturnType<typeof loadEcosystemConfig>>["agents"][number];
type SeedIdentity = Awaited<ReturnType<typeof loadEcosystemConfig>>["users"][number]["identities"][number];
type MembershipRole = "owner" | "member";

function desiredMembershipsForAgent(agent: SeedAgent): Map<string, MembershipRole> {
  const memberships = new Map<string, MembershipRole>();

  for (const userId of unique(agent.members)) {
    memberships.set(userId, "member");
  }

  for (const userId of unique(agent.owners)) {
    memberships.set(userId, "owner");
  }

  return memberships;
}

function desiredIdentityExternalIdsByChannel(identities: SeedIdentity[]): Map<string, string[]> {
  const idsByChannel = new Map<string, string[]>();

  for (const identity of identities) {
    const externalId = identity.channel === "whatsapp" ? normalizePhoneNumber(identity.externalId) : identity.externalId;
    idsByChannel.set(identity.channel, [...(idsByChannel.get(identity.channel) ?? []), externalId]);
  }

  return idsByChannel;
}

function findDefaultAgentForUser(agents: SeedAgent[], userId: string): SeedAgent | undefined {
  return (
    agents.find((agent) => agent.type === "personal" && agent.owners.includes(userId)) ??
    agents.find((agent) => agent.type === "shared" && [...agent.members, ...agent.owners].includes(userId))
  );
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
