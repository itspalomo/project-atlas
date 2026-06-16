# Skills

Atlas skills are declarative capability packs for agents. They are not arbitrary code execution and they are not a security boundary by themselves.

An agent enables skills in `ecosystem/atlas.yaml`:

```yaml
agents:
  - id: household
    skills:
      - household
      - planning
      - calendar
      - reminders
      - health
      - training
      - nutrition
      - location
      - memory
      - whatsapp
```

During seed/profile generation Atlas validates every skill id, stores an expanded skill manifest in the agent config, appends skill guidance to `SOUL.md`, and writes `skills.json` next to the generated Hermes profile.

Built-in skills:

| Skill | Purpose |
| --- | --- |
| `household` | Shared family coordination without crossing private memory boundaries. |
| `planning` | Goal, availability, and next-action planning. |
| `calendar` | Free/busy reasoning and intentionally shared calendar context. |
| `reminders` | Reminder proposals with iOS bridge execution after approval. |
| `health` | Non-diagnostic HealthKit summary reasoning. |
| `training` | Workout, recovery, schedule, and gym-context support. |
| `nutrition` | Calorie, macro, hydration, meal, and confidence reasoning. |
| `location` | Coarse semantic place context such as home, work, gym, or unknown. |
| `memory` | Honcho workspace use with Atlas memory isolation. |
| `whatsapp` | WhatsApp-native response style and channel behavior. |

Enforcement remains in Atlas:

- Channel identity and allowlists are enforced by `identity_channels`.
- Bridge device tokens are scoped to one `userId`.
- Calendar, reminder, goal, commitment, and sharing writes require approvals.
- Honcho workspace boundaries are configured per agent and shared memory requires grants.
- WhatsApp duplicate delivery and signature checks are handled before the runtime sees the message.

Custom skills should be added as first-class catalog entries before use. That keeps installs deterministic and prevents typos in `ecosystem/atlas.yaml` from silently becoming inert prompt text.
