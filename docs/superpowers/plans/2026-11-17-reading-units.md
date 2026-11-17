# Reading training units

Add words/phrases, sentences, paragraph, article as a separate choice from CEFR language level. Default new reading UI to words. Keep the API field optional so older requests, practice records and recovery hashes remain compatible.

1. Share unit labels and deterministic output bounds in reading-levels.ts. Persist units with generated speaking practices and reject mismatched AI output.
2. Add selectors to the practice builder and vocabulary generator. Add fixed reading demo samples for both languages and all units; preserve existing writing demos.
3. Add listen-to-item controls for word/sentence units, reusing matching-local-voice playback and recording cancellation.
4. Update the coach instructions with unit-specific lengths and English instructions. Verify schemas, legacy restoration, demo shapes, API propagation and invalid model output. Run all tests, type check and build.
