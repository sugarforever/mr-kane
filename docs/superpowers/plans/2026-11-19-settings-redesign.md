# Settings redesign implementation plan

**Goal:** Implement the approved Claude Design settings workspace in the existing app.
**Architecture:** Retain the existing Svelte components and API contracts. Keep each section mounted while switching visibility so drafts and OAuth flows survive navigation. Use a native modal dialog for the provider drawer.
**Tech stack:** Svelte 5, existing UI components, Vitest.
**Spec:** https://claude.ai/chat/d3651919-e200-4b0c-bea7-45847918a664?artifact=daacdddd-e5df-4751-954c-f2f5ad65b6bf

## Constraints
- Preserve real credentials, model discovery, subscription sign-in, MiniMax regions and voice selection.
- Use real server state, never prototype fixtures or simulated tests.
- Keep existing settings links compatible; display Settings in navigation.

## Tasks
- [x] Add the settings header and responsive section navigation in AIProviders.svelte; retain drafts with mounted sections.
- [x] Present connected providers compactly, expose the default model, and move the existing editor to an accessible modal drawer.
- [x] Restyle SpeechSettings.svelte and SearchSettings.svelte with status, scoped save actions and expandable data notes.
- [x] Run Svelte checks, the full existing test suite, build, and browser review at desktop/mobile sizes.

## Review focus
- Section switches must not discard drafts or stop sign-in polling.
- Failed loads must offer retry and must not show a misleading empty state.
- Escape and close must restore focus from the drawer.
- Unsaved search changes must disable tests of the saved connection.
- Narrow screens must keep fields, actions and navigation usable.
