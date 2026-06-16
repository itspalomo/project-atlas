# Atlas Bridge API

The bridge API is served by `atlas-api` under `/bridge/v1`.

Implemented endpoints:

- `POST /bridge/v1/devices/register`
- `POST /bridge/v1/health/daily-summary`
- `POST /bridge/v1/nutrition/daily-summary`
- `POST /bridge/v1/nutrition/meal-entry`
- `POST /bridge/v1/calendar/busy-blocks`
- `POST /bridge/v1/location/signal`
- `GET /bridge/v1/approvals/pending?userId=<id>`
- `POST /bridge/v1/approvals/:id/decision`

Authentication:

- Bootstrap uses `Authorization: Bearer <ATLAS_BRIDGE_API_KEY>`.
- Device pairing uses `POST /bridge/v1/devices/register` with the bootstrap token.
- Registered devices use `Authorization: Bearer <device-token>` plus `X-Atlas-Device-Id: <device-id>`.
- Device tokens are scoped to the paired `userId`; they cannot write another user's health, nutrition, calendar, location, or approval data.
- Device token hashes are stored in `bridge_devices`; raw device tokens are returned once at registration.

Privacy rule:

The mobile bridge sends summaries, availability windows, intake facts, and semantic signals. It does not send raw HealthKit samples, full calendar event bodies, raw location history, or raw meal photos by default.

Idempotency:

- Daily health and nutrition summaries upsert by `userId + date`.
- Calendar busy blocks replace a submitted sync window.
- Nutrition meal entries may include `externalId`; when provided, Atlas upserts by `userId + source + externalId` to handle mobile retry safely.
