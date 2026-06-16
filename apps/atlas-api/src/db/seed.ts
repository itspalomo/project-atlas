import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import { z } from "zod";
import { createPool } from "./pool.js";
import { normalizePhoneNumber } from "../identity/phone.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ecosystemSchema = z.object({
  users: z.array(
    z.object({
      id: z.string(),
      displayNameEnv: z.string().optional(),
      displayName: z.string(),
      whatsappNumberEnv: z.string().optional()
    })
  ),
  agents: z.array(
    z.object({
      id: z.string(),
      displayName: z.string(),
      type: z.enum(["personal", "shared"]),
      hermesProfile: z.string(),
      honchoWorkspace: z.string(),
      owners: z.array(z.string()),
      members: z.array(z.string()).default([]),
      skills: z.array(z.string()).default([])
    })
  )
});

async function main(): Promise<void> {
  const pool = createPool();
  const ecosystemPath = path.resolve(__dirname, "../../../../ecosystem/agents.yaml");
  const raw = await readFile(ecosystemPath, "utf8");
  const ecosystem = ecosystemSchema.parse(yaml.load(raw));

  const client = await pool.connect();
  try {
    await client.query("begin");

    for (const user of ecosystem.users) {
      const displayName = user.displayNameEnv ? process.env[user.displayNameEnv] || user.displayName : user.displayName;
      await client.query(
        `
          insert into users (id, display_name, kind)
          values ($1, $2, 'person')
          on conflict (id)
          do update set display_name = excluded.display_name, updated_at = now()
        `,
        [user.id, displayName]
      );
    }

    for (const agent of ecosystem.agents) {
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
          agent.hermesProfile,
          agent.honchoWorkspace,
          JSON.stringify({ skills: agent.skills })
        ]
      );

      for (const owner of agent.owners) {
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

      for (const member of agent.members) {
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
      if (!user.whatsappNumberEnv) {
        continue;
      }

      const rawPhone = process.env[user.whatsappNumberEnv];
      if (!rawPhone) {
        continue;
      }

      const personalAgent = ecosystem.agents.find((agent) => agent.type === "personal" && agent.owners.includes(user.id));
      if (!personalAgent) {
        continue;
      }

      await client.query(
        `
          insert into identity_channels (user_id, channel, external_id, agent_id, is_enabled)
          values ($1, 'whatsapp', $2, $3, true)
          on conflict (channel, external_id)
          do update set
            user_id = excluded.user_id,
            agent_id = excluded.agent_id,
            is_enabled = true,
            updated_at = now()
        `,
        [user.id, normalizePhoneNumber(rawPhone), personalAgent.id]
      );
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

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
