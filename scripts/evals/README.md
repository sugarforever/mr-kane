# Live agent evaluations

Run real-model behavior checks against the application's current Pi runtime, tools and Skills. No evaluation framework or extra runtime dependency is required. The normal `npm test` suite never calls a paid provider.

```sh
npm run test:eval:math -- --list
npm run test:eval:math -- --case independent-completion
npm run test:eval:math
npm run test:eval:math -- --repeat 3 --model deepseek-flash
```

Set `DEEPSEEK_API_KEY` in the shell. The default endpoint is DeepSeek's public API; `MR_KANE_EVAL_BASE_URL` overrides it for compatible endpoints or synthetic integration tests. Live runs incur the selected provider's charges.

## Cases and adapters

`math-profile.cases.json` contains versioned cases with three parts. Shared starting state lives in `defaults.initial`; case-specific fields override it:

- `initial`: a synthetic learner and imported conversation, before the decision being tested.
- `turns`: student messages sent through the real tutor. Imported assistant turns are fixtures; new tutor replies, tool calls and profile consolidation are real model executions.
- `expected`: assertions used only by the runner, never included in model input.

The initial cases cover independent completion, hinted work, self-report and pausing. Their chapter plan has one explicitly agreed objective. They test completion against that scope, not mastery of every topic in the textbook chapter. These are small regression cases, not a representative benchmark of teaching ability.

`math-profile.ts` adapts fixtures to the real application and collects observations. `checks.mjs` grades structured signals and persisted state. `run.mjs` handles independent trials and reporting; `worker.mjs` loads TypeScript through the existing Vite dependency. To add another feature, implement an adapter exporting `runScenario(input, runDir, config)`, write its outcome checker and cases, and register the module/checker in the runner’s `adapters` map. No runner lifecycle or reporting changes are needed. Keep model-judgment criteria in the case labels and deterministic business rules in code.

## Isolation and evidence

Each case and repeat runs in a fresh process with a new `MR_KANE_DATA_DIR`. Provider credentials, default model, conversations, profiles and request archives stay inside that store. Existing development data and model settings are neither read nor changed. Skills and source code are read from the checkout without modification. Vite uses a private cache and opens no application HTTP port.

Runs create a private directory under `.eval-runs/`, excluded from Git. `--output-dir PATH` chooses another parent directory; the runner always creates a new child. Results include:

- `metadata.json`: model, endpoint, commit, working-tree source diff hash, suite hash and repetition count.
- `results.json`: expected outcomes, observations, individual checks and `pass` / `fail` / `error` verdicts.
- Each case's `turns.json`, `session.json` and `trace.json`: replies, progress timing, learner before/after, tool calls and token usage. Hidden reasoning text is omitted. `requests.jsonl` records actual system instructions, the latest user input and tool names, without authorization headers.
- A private `data/` store for debugging and `worker.log` / `error.json` for failures. The data store contains the test credential; do not upload it. Logs redact the configured key.

A completion case also sends a real follow-up message and waits for consolidation. Outcomes are checked separately: signal present and correct, profile changed and target lesson completed, chat saved, follow-up accepted, and background work settled.

Independent trials use new request IDs and stores, bypassing application replay. Imported history is fixed so runs remain comparable. Repeat a small case set before drawing reliability conclusions. Inspect failed traces rather than treating one aggregate score as proof.

Provider/transport failures are `error`, not evidence that the model misjudged the lesson. Model responses rejected by the application’s response schema are behavioral `fail` results. Authentication or billing errors stop the suite before remaining cases. Each case has a six-minute process deadline; timeout is an error. Repeat count is capped at five. The runtime retains its existing per-turn limits and profile retries. Custom-provider token counts are recorded, but its zero-valued SDK cost estimate is not an actual billing estimate.

Delete a run directory to remove its isolated data and credential after debugging. Results are local; nothing is published by the runner. Only synthetic case content and the application's teaching context are sent to the selected model API.

## Initial live validation — 2026-11-27

Model: `deepseek-flash`. Four fixed-history scenarios, two independent trials each: **8 passed, 0 failed, 0 errors**. Both positive trials persisted the completed lesson and accepted a real follow-up; all six negative trials left the learner unchanged.

Before the prompt correction, all four baseline scenarios returned ordinary Markdown and were rejected by the response parser. The actual request capture confirmed the current system prompt and output schema reached the model. The response contract now explicitly requires one JSON object with Markdown inside `reply`, includes a minimal example, and appears after the chapter catalog. The completion evidence requirements were unchanged. Re-running the same cases produced the results above.

This small suite tests the agreed objective of a synthetic chapter plan at its completion boundary. It does not establish general teaching quality, a low failure rate over arbitrary lessons, or reliability of other models. Expand the dataset with real failures, multiple objectives and longer histories before using it as a release gate.
