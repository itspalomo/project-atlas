# Atlas Bridge API

The bridge API is served by `atlas-api` under `/bridge/v1`.

Implemented endpoints:

- `POST /bridge/v1/health/daily-summary`
- `POST /bridge/v1/nutrition/daily-summary`
- `POST /bridge/v1/nutrition/meal-entry`
- `POST /bridge/v1/calendar/busy-blocks`
- `POST /bridge/v1/location/signal`
- `GET /bridge/v1/approvals/pending?userId=<id>`
- `POST /bridge/v1/approvals/:id/decision`

Authentication:

- Phase 1 uses `Authorization: Bearer <ATLAS_BRIDGE_API_KEY>`.
- Device-specific tokens are supported through `bridge_devices` with `X-Atlas-Device-Id` and a SHA-256 token hash.

Privacy rule:

The mobile bridge sends summaries, availability windows, intake facts, and semantic signals. It does not send raw HealthKit samples, full calendar event bodies, raw location history, or raw meal photos by default.
