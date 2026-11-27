# Math Profile Checkpoints Implementation Plan

**Goal:** Update the math learner profile only after a lesson completes, without blocking chat on consolidation.

**Architecture:** Math replies are plain Markdown. The model calls complete_lesson with plan and chapter IDs after assessment; the tool records a durable intent, never a full learner record. Persist the resulting completion job alongside the reply in the existing study document. A separate worker consolidates the conversation through that reply, validates the requested lesson and evidence, and merges only the learner field under a short write lock. Language study retains its existing behavior.

**Spec:** User-approved conversation: lesson completion is the only automatic profile update trigger; all messages remain durable; consolidation must not block sending.

## Tasks

- [x] Add failing tests for ordinary reply preservation, asynchronous completion, concurrent chat, replay deduplication, invalid evidence, retry and recovery.
- [x] Extend the shared study lifecycle with optional durable completion jobs; capture bounded inputs, serialize workers separately from chat, persist failure state and retry at most three times. Resume pending jobs on session access after restart.
- [x] Wire the complete_lesson tool to a dedicated profile agent, checking the requested lesson is newly completed and preserving existing provenance checks.
- [x] Align math prompts and course skills: plans and intermediate evidence stay in conversation until completion; update nonblocking profile status in the UI.
- [x] Run focused tests, type checks, full suite and build; review the diff; commit and open a PR against main.

## Review Focus

- Ordinary turns and legacy responses cannot silently mutate profiles.
- Slow or failed consolidation cannot block a new chat turn.
- A later chat message is never overwritten by a background result.
- Replays and repeated complete_lesson calls do not produce duplicate updates.
- Invalid completion evidence leaves the saved learner unchanged; jobs survive restart and report failure.

## Validation

Regression tests demonstrate reply-only turns, background concurrency, evidence rejection, bounded retries, fresh assessments after exhausted retries, and queued model capacity. The production smoke fixture terminates the server during consolidation and verifies recovery without losing later messages.
