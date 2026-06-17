# Bridge API Reference

The bridge API is served by `atlas-api` under `/bridge/v1`.

Hermes does not call these write endpoints directly. Hermes reads scoped custom context through the Atlas MCP endpoint at `/mcp`; bridge writes still require device tokens or approval flows.

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/bridge/v1/devices/register` | Pair a device using the bootstrap bridge token. |
| `POST` | `/bridge/v1/health/daily-summary` | Upsert HealthKit-derived daily summaries. |
| `POST` | `/bridge/v1/nutrition/daily-summary` | Upsert daily nutrition summaries. |
| `POST` | `/bridge/v1/nutrition/meal-entry` | Upsert or insert meal entries. |
| `POST` | `/bridge/v1/training/plan` | Create or update a training plan. |
| `GET` | `/bridge/v1/training/plans?userId=<id>` | List scoped training plans. |
| `POST` | `/bridge/v1/training/planned-workout` | Upsert planned workout details. |
| `POST` | `/bridge/v1/training/performed-workout` | Upsert performed workout details. |
| `GET` | `/bridge/v1/training/planned-workouts?userId=<id>` | List planned workouts. |
| `GET` | `/bridge/v1/training/performed-workouts?userId=<id>` | List performed workouts. |
| `POST` | `/bridge/v1/calendar/busy-blocks` | Replace a submitted busy-block sync window. |
| `POST` | `/bridge/v1/location/signal` | Store semantic location signals. |
| `GET` | `/bridge/v1/approvals/pending?userId=<id>` | Fetch pending approvals for a user. |
| `POST` | `/bridge/v1/approvals/:id/decision` | Submit approval decisions. |

## Authentication

- Bootstrap uses `Authorization: Bearer <ATLAS_BRIDGE_API_KEY>`.
- Device pairing uses `POST /bridge/v1/devices/register` with the bootstrap token.
- Registered devices use `Authorization: Bearer <device-token>` plus `X-Atlas-Device-Id: <device-id>`.
- Device tokens are scoped to the paired `userId`.
- Device token hashes are stored in `bridge_devices`; raw device tokens are returned once at registration.

## Privacy Rule

The mobile bridge sends summaries, availability windows, intake facts, and semantic signals. It does not send raw HealthKit samples, full calendar event bodies, raw location history, or raw meal photos by default.

## Idempotency

- Daily health and nutrition summaries upsert by `userId + date`.
- Calendar busy blocks replace a submitted sync window.
- Nutrition meal entries may include `externalId`; when present, Atlas upserts by `userId + source + externalId`.
- Planned and performed training workouts may include `externalId`; when present, Atlas upserts the workout and replaces child exercises/sets.
