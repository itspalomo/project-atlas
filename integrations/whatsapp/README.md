# WhatsApp Integration

The runnable WhatsApp integration is Hermes' native WhatsApp gateway.

The legacy Atlas webhook under `apps/atlas-api/src/whatsapp` is opt-in and exists for local testing or future custom proxy work. It is disabled by default through `ATLAS_LEGACY_WHATSAPP_WEBHOOK_ENABLED=false`.

This folder is reserved for channel-specific operational assets such as:

- Meta app setup notes.
- Webhook payload fixtures.
- Future media handling.
- Future Hermes-native group/family chat customization notes.
