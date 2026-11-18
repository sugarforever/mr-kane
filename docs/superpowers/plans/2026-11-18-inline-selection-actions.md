# Inline selection actions

Goal: Automatically show Translate, Pronounce and Add to vocabulary beside selected reading text.

Approach: Reuse the existing Bits UI popover with a virtual Range anchor, collision handling and preserved selection. Keep the explicit trigger and textarea for keyboard access.

- [x] Anchor the popover to the selection and open automatically without stealing focus.
- [x] Preserve action feedback and keyboard fallback; close on clear selection, outside interaction and Escape.
- [x] Validate selection, replacement, dismissal, actions in the dev server; run check, tests and build.
- [x] Review the diff and create a PR.

Validation: Chrome against the local Vite dev server verified automatic opening, replacement selection, vocabulary saving, local pronunciation, translation response, and Escape dismissal. npm run check: zero errors/warnings; npm test: 97 passing; npm run build: passed. Review identified focus restoration on dismissal, addressed before delivery.
