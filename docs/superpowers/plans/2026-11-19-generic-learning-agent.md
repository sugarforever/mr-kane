# Generic Learning Agent Implementation Plan

**Goal:** Reuse agent execution, durable study sessions and streaming across subjects while preserving math and language behavior.

**Architecture:** Subject adapters supply prompts, tools, execution budgets and learner schemas. A shared runtime snapshots execution settings and guards request identity; a session factory owns admission, retries and atomic saves. Generic stream transport exposes only reply progress and retains JSON response support.

**Tech Stack:** TypeScript, SvelteKit, Pi durable, SQLite, Zod, Vitest.

**Spec:** The delegated user request in this chat.

## Constraints and review focus

- Keep math tables, JSON shapes and legacy request hashes usable.
- Keep language research and speech tools in the language adapter.
- Isolate subject request identities and learner schemas.
- Failed and discarded turns must retain existing semantics.
- Disconnects must not cancel saves; stop watches, timers and readers.
- Partial JSON must expose only top-level reply text.

## Tasks

1. Add a failing non-math subject session test covering profile validation, retry, replay, isolation, progress and discard. Extract shared learning types and a configured session factory; retain math aliases and its original storage namespace.
2. Add a failing custom-agent runtime test covering configured prompts/tools, replay and identity conflict. Extract subject-independent execution, with snapshotted settings; move math and language selection and research into adapters. Preserve old job hash and snapshot support at adapter boundaries.
3. Add generic transport tests for typed completion and disconnect-safe saves. Extract the NDJSON response and client reader, retain the math reader alias and route JSON compatibility, and use the shared reader in the math page.
4. Run all tests, type checks and production math smoke coverage. Review the full diff, commit, push and open a separate PR without merging.

Execution is authorized autonomously in this chat; implement in this session.
