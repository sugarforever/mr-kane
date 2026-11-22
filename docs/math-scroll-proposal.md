# Proposal: predictable scrolling in Math

Status: proposed for review, 22 November 2026. This PR changes documentation only.

## Problem and evidence

The live Math page was inspected with an existing long conversation and populated learner profile. Browser measurements used actual viewports of 1440 × 707 and 500 × 707 CSS pixels; the browser did not honor the requested smaller phone width. Smaller phones, touch gestures, virtual keyboards, and keyboard-only navigation still need validation.

| Area | Observed behavior | Priority |
| --- | --- | --- |
| Desktop profile and page | The profile expanded the document to about 2,423px, while the chat column remained 607px tall. Scrolling the document moved the chat, header, and composer off-screen and left a large blank center column. | High |
| Narrow-screen profile drawer | Its internal scrollbar reached the bottom, but the fixed drawer began at 100px while the responsive header ended around 395px. It covered the profile toggle; a hit test confirmed the toggle's center was intercepted by the drawer. No close control exists inside it. | High |
| Narrow-screen conversations | Six conversations wrapped into multiple rows: 122px of content inside a 45px-high area. This produces a cramped vertical scrollbar. | Medium |
| Reply following | Source inspection shows unconditional smooth scrolling for progress events and completion. This can pull readers away from earlier messages. This interaction was not reproduced by submitting a new AI request. | Medium |

Desktop conversation history, transcript, and IrMO library all reached both ends when their scroll positions were exercised. A long draft gained an internal textarea scrollbar and stayed capped at 160px. Mobile transcript content intentionally uses document scrolling, with a sticky composer. Tables and displayed equations should keep horizontal overflow for wide content.

## Proposed behavior

### Desktop: one viewport, independent panels

```text
Math shell (viewport height)
├── Sidebar
│   ├── Brand and actions
│   ├── Conversations (vertical scroll)
│   └── Footer
└── Main
    ├── Header
    └── Workspace (remaining height)
        ├── Chat
        │   ├── Transcript OR IrMO library (vertical scroll)
        │   └── Composer (visible during chat)
        └── Learner profile (vertical scroll)
```

Constrain the desktop shell and workspace to the available viewport height. Use shrinkable grid/flex tracks (`minmax(0, 1fr)` and `min-height: 0`) so content scrolls inside the intended panels. Give the learner panel its own vertical overflow instead of allowing its content to increase the document height. Keep the header and composer visible as the transcript or profile scrolls.

Use `overscroll-behavior-y: contain` on desktop panel scroll areas so reaching an edge does not move an ancestor. Preserve native scrollbars; do not add a custom scrollbar library. Keep sidebar actions reachable at short window heights, allowing a sidebar overflow fallback if its fixed controls cannot fit.

### Mobile: document scrolling and a dismissible profile

Keep document scrolling for the transcript and library, plus the sticky chat composer. Remove desktop height constraints at the mobile breakpoint. Do not apply panel scroll containment to the mobile transcript or library.

Use a single, non-wrapping horizontal conversation strip, with horizontal overflow and no vertical scrolling. Explicitly override the global `nav` wrapping and child flex rules for this module. Preserve truncated titles and accessible full names.

Present the profile as a modal drawer with an internal close button, accessible name, Escape dismissal, focus containment, and focus restoration to its trigger. Lock background scrolling while open. Its body scrolls independently, and its close control stays visible. Anchor the drawer to the viewport rather than a fixed 100px header assumption. Use the same accessible drawer behavior at intermediate widths where the profile is hidden by default.

### Follow replies without interrupting reading

Track whether the transcript is near its bottom (proposed threshold: 80px). Follow reply updates only while that state is true. If the reader scrolls away, preserve their position and display a keyboard-accessible “Jump to latest” button. Activating it returns to the bottom and resumes following.

Opening a conversation and sending a message should intentionally reveal the latest turn. Progress updates and reply completion should honor the reader's current follow state. Scope desktop movement to the transcript element instead of using `scrollIntoView` across every ancestor. For mobile document scrolling, reveal the latest turn above the sticky composer. Respect reduced-motion preferences and avoid repeated smooth-scroll animations during frequent updates.

## Implementation scope

- `src/routes/math/+page.svelte`: height constraints, panel overflow, conversation strip, profile drawer, and follow state.
- `src/lib/components/IrmoLibrary.svelte`: explicit shrink/overflow behavior within the desktop chat track; normal document flow on mobile.
- Existing shared dialog primitives, if suitable, for drawer focus and dismissal behavior.
- Keep CSS changes scoped to Math; global `nav` styling also serves other screens.

No API, storage, tutoring, or conversation data changes are needed. Keep the existing textarea height cap and horizontal overflow for mathematical content.

## Acceptance checks for implementation

1. At 1440 × 900 and a short desktop window such as 1280 × 600, load a long conversation and long profile. The document has no unintended vertical scroll; the header and composer stay visible. Transcript, profile, and conversation list independently reach their first and last items.
2. Exercise mouse wheel, trackpad, scrollbar dragging, and keyboard scrolling on each panel. At panel edges, adjacent panels stay put. Focus indicators and final content remain visible.
3. Open the IrMO library, scroll to its last question, open a question, and return to the conversation. Confirm all controls remain reachable and drafts and selected conversation are preserved.
4. At 1024px and 768px widths, open and dismiss the profile using its close button and Escape. Confirm focus restoration, contained keyboard focus, and background scroll locking.
5. At actual 390 × 844 and 500 × 707 viewports, verify a non-wrapping conversation strip with horizontal scrolling only. Confirm the page, library, and sticky composer remain usable without horizontal document overflow.
6. On a phone with the software keyboard open, confirm the focused input and send button are visible and that the profile can still be closed. Include portrait and landscape.
7. With mocked reply progress, verify bottom-following, scrolling away during a reply, completion while scrolled away, “Jump to latest,” conversation switching, and deliberate scrolling after send. Repeat with reduced motion enabled. Avoid paid AI calls in automated checks.
8. Enter a long draft and render wide equations and tables. The textarea stays bounded; mathematical content scrolls horizontally without creating extra vertical scroll regions.

For implementation, add focused browser regressions for panel bounds, drawer dismissal, conversation wrapping, and follow state, then run the repository's type checks, tests, and build. These are proposed checks, not results from this documentation PR.

## Review decisions

The proposed defaults are independent desktop panel scrolling, document scrolling on mobile, a horizontal mobile conversation strip, a modal profile drawer, and an 80px follow threshold. Review these behaviors before implementation.
