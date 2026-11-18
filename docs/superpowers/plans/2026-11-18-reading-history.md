# Reading history

Use the installation's private SQLite database for immutable practice snapshots and audio BLOBs, committed together. Follow existing single-user origin checks and private filesystem permissions. Keep legacy IndexedDB originals; imports are idempotent and never overwrite newer server notes or feedback. New recordings save only after server acknowledgement.

1. Add storage tests for durable bytes/snapshots, retry-safe imports, atomic patches and delete races. Implement validated metadata and SQLite storage.
2. Add bounded upload/read/patch/delete endpoints with origin checks and no-store responses. Test validation and access failures.
3. Retain legacy storage as an import source; add server client flows with explicit import results and tests for failed/repeated imports.
4. Add linked reading history page, language filtering, replay and detail review including original/target script, notes and feedback. Integrate recorder server saves and update privacy copy.
5. Run full tests, Svelte/type checks and production build; review resulting changes.
