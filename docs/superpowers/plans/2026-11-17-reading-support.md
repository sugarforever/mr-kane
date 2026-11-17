# Reading support

Implement the approved English comparison and whole-passage browser reading in the current checkout. Leave existing records and attachments untouched.

1. Add a bounded passage translation contract and same-origin route using the configured Pi runtime. Return one English paragraph for each original paragraph; reject mismatched results. Send only passage text and language.
2. Add a validated browser cache keyed by exact source text and language. Load only on demand; preserve existing learning records and report storage failures.
3. Add whole-passage playback using only matching local voices, with normal/slow speed, pause/resume/stop. Chunk long text and cancel on recording, passage replacement, or component destruction.
4. Integrate shadcn controls and an English comparison with the reading component. Keep English outside the original-text selection scope.
5. Test contracts, cache invalidation, API errors, playback lifecycle, and recording cancellation. Run tests, type check, and production build. Browser automation is unavailable under the previously reported URL security policy; do not bypass it.
