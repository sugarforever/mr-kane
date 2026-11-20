# Server-owned learning storage implementation plan

Goal: Move durable browser learning records into schema-validated Pi documents backed by SQLite. Retain disposable passage translation and speech caches in the browser. No pub/sub or replacement Pi execution model.

Architecture: A backend learning store owns profiles, notebook records, drafts, vocabulary and language request recovery records. A discriminated command schema and typed client expose targeted mutations, never whole-state replacement. Existing Pi execution stores and recording storage remain unchanged.

- [x] Add shared schemas, transactional Pi-backed learning store, same-origin HTTP interface, and tests for persistence, merge-only migration, independent updates, and invalid input.
- [x] Move UI persistence to typed client calls; serialize draft saves; import legacy browser records with durable receipts before removing matching originals. Preserve translation/audio caches.
- [x] Persist generated practices and feedback before endpoint success, with server-side pending request records and replay. Remove redundant math browser pending storage (Pi study state already persists it).
- [x] Run type checks, tests, build, review changes, update documentation.

Migration constraints: Never overwrite existing server records with browser imports; import receipts prevent resurrection after subsequent edits/deletes. Validate entire import before committing. Failed imports retain originals. Browser access is limited to migration and disposable caches.

Implementation notes: Stored JSON records in a schema-validated Pi session document in learning.sqlite; retained existing Pi execution databases. Added per-source migration receipts, server result replay, serialized UI notebook updates and draft saves, and legacy math import/discard regression coverage.
