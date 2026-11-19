# Math Study Implementation Plan

> **For agentic workers:** Implement sequentially in this checkout. The user authorized adding the feature; no delegation is required.

**Goal:** Add a saved chat-based Math experience using the uncompressed bundled AoPS library, learning the student's background and adapting teaching and plans.

**Architecture:** A dedicated Math route uses existing AI provider settings. Server-side conversations retain messages and an explicit learner profile. Each turn loads the AoPS skill/curriculum and receives its conversation context, with bounded library retrieval tools. Private source assets are served through validated library identifiers. Markdown and math are safely rendered in chat.

**Tech Stack:** SvelteKit, Svelte 5, Zod, Pi Durable/pi-ai, SQLite, Markdown and KaTeX.

**Spec:** User request in this conversation, 2026-11-19.

## Global Constraints

- Bundle uncompressed Markdown and images in skills/aops-study; no dependency on Downloads or installed personal skills.
- Reuse selected AI provider and existing same-origin request validation; no paid calls in tests.
- Student model distinguishes reported background, observed strengths, and gaps; adapt through conversation without a long intake gate.
- Preserve conversation and profile across reloads; support retry without duplicate turns; do not mix language-coach prompts into Math.

## Review Focus

- Invalid library paths cannot escape the bundled library; stored chat HTML cannot execute.
- Retry of a failed/pending turn keeps the same request and original context; new messages cannot race a pending turn.
- Missing providers produce clear setup guidance rather than simulated tutoring.
- Learner facts are updated only after a successful turn, keeping previous profile on errors.
- Long chats and library retrieval stay bounded, retain the learner profile, and explicitly handle missing material.

### Task 1: Library and math contracts
- [x] Test section/problem retrieval, traversal rejection, excluded Problem 301, and profile/message validation.
- [x] Bundle skill and implement bounded AoPS library functions and Pi tools.

### Task 2: Conversation runtime
- [x] Test persistence, idempotent retry, context continuity, provider prompt isolation, and profile updates/failure behavior.
- [x] Add SQLite Math sessions/turns and extend runCoach with an isolated Math mode and retrieval tools.
- [x] Add session/chat/library endpoints with same-origin mutation validation.

### Task 3: Math UI
- [x] Add Math navigation and responsive chat with session history, starter prompts, learner profile, retry and new chat.
- [x] Render safe Markdown/LaTeX and local figures. Show AI setup guidance when disconnected.
- [x] Verify sanitizer behavior, run all tests/check/build, inspect browser flow, and document deployment/storage.
