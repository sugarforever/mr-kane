# AI providers and durable coaching

Implement in the existing MVP checkout, preserving its English UI and learning records.

- Server-owned SQLite settings and credential slots; public responses contain presence/status only.
- Multiple named connections, native Pi catalog, tested API-key connections, keyless local endpoints, selected default provider/model.
- Pi OAuth interaction controller with official URLs, device codes, cancellation, expiry and persisted refresh credentials.
- Pi Durable stores each coaching request and immutable model/connection snapshot; idempotent request IDs allow retry after a lost HTTP connection or restart.
- English AI Providers settings and a header model selector; learner data and audio behaviour remain unchanged.
- Verify storage isolation/redaction, discovery failures, synthetic OAuth and token refresh, durable generation/reopening, production HTTP and browser settings.

Public hosting and shared-account authentication are outside this local-only MVP.

## Verified
18 tests pass. Type checks and production build pass. Production fixture verifies settings/redaction, same-origin enforcement, SIGKILL during a model request, restart recovery and replay without a third model call. Official sign-in is left to the user; no real account credentials were used.
