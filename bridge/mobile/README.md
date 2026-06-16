# Atlas iOS Bridge

The companion iOS app is the local privacy boundary for Apple data.

Responsibilities:

- Read HealthKit locally from iPhone and Apple Watch sources.
- Summarize daily health metrics before sending to Atlas.
- Summarize nutrition intake from local/manual sources before sending to Atlas.
- Sync performed workout summaries from HealthKit when the user authorizes workout access.
- Send planned/performed workout exercises and sets when the user enters them locally, imports them, or approves agent-created plans.
- Read calendars locally and send busy blocks or user-approved event details.
- Create Apple Reminders only after approval.
- Deliver native notifications using content produced by Atlas.
- Optionally classify location locally into semantic places such as `gym`, `home`, or `work`.

Nutrition behavior:

- Send daily calories, macros, fiber, hydration, and source confidence when available.
- Send meal entries only when useful for coaching context.
- Keep raw meal photos, labels, and third-party app exports local unless the user explicitly shares them.

Health data source behavior:

- Apple Watch workouts and rings normally appear in HealthKit on the phone after sync.
- The bridge should preserve source metadata while sending only aggregate summaries.
- If phone and watch values conflict, the bridge should prefer HealthKit's aggregate query result and include `source: mixed`.

Training behavior:

- HealthKit is a good source for performed workout summaries.
- Set-level gym prescriptions and completions should come from local entry, chat-confirmed plans, or a specialized tracker when HealthKit does not expose them as structured facts.
- Use stable local ids or HealthKit workout ids as `externalId` so retries upsert the workout and replace nested exercises/sets.

Calendar privacy:

- Default sync sends only `startsAt`, `endsAt`, `availabilityType`, and `sourceCalendarHash`.
- Event title, notes, invitees, and location stay local unless the user explicitly shares the event.

Future implementation target:

- React Native iOS app with a development client because HealthKit, EventKit, Reminders, notifications, and background sync need native modules.

Pairing model:

- Use the bootstrap bridge token only during controlled setup.
- Register the device with Atlas and store the returned device token in the iOS Keychain.
- Send `X-Atlas-Device-Id` on bridge requests.
- Generate stable local ids for meal entries and pass them as `externalId` so retries do not duplicate meals.
- Generate stable local ids for planned/performed workouts and pass them as `externalId`.
- Future hardening can add Apple App Attest before issuing device tokens.
