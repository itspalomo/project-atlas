# Atlas iOS Bridge

The companion iOS app is the local privacy boundary for Apple data.

Responsibilities:

- Read HealthKit locally from iPhone and Apple Watch sources.
- Summarize daily health metrics before sending to Atlas.
- Read calendars locally and send busy blocks or user-approved event details.
- Create Apple Reminders only after approval.
- Deliver native notifications using content produced by Atlas.
- Optionally classify location locally into semantic places such as `gym`, `home`, or `work`.

Health data source behavior:

- Apple Watch workouts and rings normally appear in HealthKit on the phone after sync.
- The bridge should preserve source metadata while sending only aggregate summaries.
- If phone and watch values conflict, the bridge should prefer HealthKit's aggregate query result and include `source: mixed`.

Calendar privacy:

- Default sync sends only `startsAt`, `endsAt`, `availabilityType`, and `sourceCalendarHash`.
- Event title, notes, invitees, and location stay local unless the user explicitly shares the event.

Future implementation target:

- React Native iOS app with a development client because HealthKit, EventKit, Reminders, notifications, and background sync need native modules.
