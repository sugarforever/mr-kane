# Pi-native study revision

Goal: update PR #15 to use Pi Durable directly for study storage, conversation history and submission recovery; retain only provider integration, domain policy and HTTP adapters.

- Use one Pi SQLite store per study session plus a subject request ownership index. Import old SQL records once without deleting them.
- Use a persistent Pi conversation for each study session. Native submissions retain admitted input and idempotency; native transcript supplies history on subsequent turns.
- Commit the validated reply, learner and completion marker together in a Pi document transaction. Pending legacy jobs continue through the original durable job path.
- Keep explicit domain conflict/discard checks. Reset model context to accepted history after discarding a failed response, so it cannot contaminate later turns.
- Make session APIs asynchronous; retain their HTTP shapes and access checks. Readers open Pi in read-only mode while generation continues.
- Consolidate the old agent facade into the language adapter and shared executor. Keep only necessary runtime/provider and HTTP glue.
- Verify native multi-turn context, restart/replay, legacy import/pending retry, conflicts/discard, atomic saves and disconnect behavior, then run all tests, type check and math production smoke. Review and update the existing PR without merging.
