# Math Streaming Implementation Plan

**Goal:** Show math replies while the model is generating, then save the validated reply and learner record together.

**Architecture:** Watch Pi Durable's live generation, extract only the student-facing reply from its partial JSON, and send progress snapshots over an opt-in NDJSON response. Existing JSON clients keep working. The final saved session remains authoritative; disconnected clients can retry the same request.

**Tech Stack:** Svelte 5, SvelteKit, Pi Durable, TypeScript, Vitest.

**Spec:** User request: “Make a PR to implement streaming.”

## Constraints and review focus

- Preserve request IDs, pending turns, learner updates, existing JSON clients, and same-origin checks.
- Never expose learner JSON, tool arguments, or internal model content as student-facing progress.
- A partial response must reach the client before the provider finishes.
- Split UTF-8, JSON escapes, tool rounds, malformed final output, disconnects, and retries must remain safe.
- Close watches, timers, and client readers; continue saving if the browser disconnects.

## Tasks

1. Add failing runtime/HTTP tests using a gated local provider: observe a partial reply before releasing the rest, verify persisted completion and replay, verify invalid completion stays pending, and verify disconnect still saves. Add client transport tests for split chunks, errors, and premature EOF.
2. Add an optional progress callback to `runCoach` in `src/lib/server/agent.ts`, attach a conversation watch before submission, and stop it in `finally`. In `src/lib/server/math/study.ts`, extract the partial top-level `reply` with the installed streaming JSON parser; validate and persist final output through the existing path.
3. Add opt-in NDJSON progress/complete/error events to `src/routes/api/math/chat/[id]/+server.ts`, preserving the existing JSON response. Bound progress buffering and release heartbeat timers on cancellation.
4. Add `src/lib/math-stream.ts` to consume chunked events. Update `src/routes/math/+page.svelte` to render temporary Markdown/math progress, show reading/writing status, and replace the preview with the saved session only on completion.
5. Run targeted tests, full tests, Svelte checks, production build and math smoke checks. Review the diff, commit, push, and create the PR.
