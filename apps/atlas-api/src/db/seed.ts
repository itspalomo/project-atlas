import { createPool } from "./pool.js";
import { normalizePhoneNumber } from "../identity/phone.js";
import { loadConfig } from "../config.js";
import { agentHermesProfile, agentHonchoWorkspace, loadEcosystemConfig } from "../ecosystem/ecosystemConfig.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const pool = createPool();
  const ecosystem = await loadEcosystemConfig(config.ecosystemConfigPath);

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

    for (const agent of ecosystem.agents) {
      const hermesProfile = agentHermesProfile(agent);
      const honchoWorkspace = agentHonchoWorkspace(agent);

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
            skills: agent.skills,
            routingAliases: agent.routing.aliases,
            defaultFor: agent.routing.defaultFor,
            runtime: agent.runtime,
            prompt: agent.prompt ?? null
          })
        ]
      );

      for (const owner of unique([...agent.owners, ...agent.routing.defaultFor])) {
        await client.query(
          `
            insert into agent_memberships (agent_id, user_id, role)
            values ($1, $2, 'owner')
            on conflict (agent_id, user_id)
            do update set role = excluded.role
          `,
          [agent.id, owner]
        );
      }

      for (const member of unique([...agent.members, ...agent.routing.defaultFor])) {
        await client.query(
          `
            insert into agent_memberships (agent_id, user_id, role)
            values ($1, $2, 'member')
            on conflict (agent_id, user_id)
            do nothing
          `,
          [agent.id, member]
        );
      }
    }

    for (const user of ecosystem.users) {
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

function findDefaultAgentForUser(agents: SeedAgent[], userId: string): SeedAgent | undefined {
  return (
    agents.find((agent) => agent.routing.defaultFor.includes(userId)) ??
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
