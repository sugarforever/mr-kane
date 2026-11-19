# Ink & Spark theme

The light theme follows the [Claude Design proposal](https://claude.ai/artifact/BZtERFLqBT8tjbZvPtAxhc). White surfaces, ink text and outlines, and restrained yellow branding keep learning content central. Primary actions are black with white text. Yellow is decorative branding, never the sole signal for status or warnings.

## Source of truth

- `src/lib/styles/theme.css`: every authored color, semantic aliases, font and shape tokens, and Tailwind role mappings. Original numbered palette identifiers remain available for compatibility, but all active semantic aliases use the Ink & Spark primitives.
- `src/app.css`: existing application layout and shared styles.
- `src/lib/styles/ink-and-spark.css`: theme typography, responsive layout, controls, selected states and settings. Imported after app.css by the root layout so the theme overrides existing styles without changing shared utility definitions.
- `src/lib/styles/fonts.css` and `static/fonts/`: self-hosted Bricolage Grotesque (headings, 600–800) and Inter (UI, 400–700), Latin and extended Latin subsets. Other scripts use the system sans-serif fallback. Both fonts are SIL Open Font License; licenses ship alongside the font files. No runtime font CDN requests.
- `src/lib/Brand.svelte`: shared brand mark and wordmark for learning and math.
- `src/lib/KaneSticker.svelte`: decorative SVG family, hidden from assistive technology, with no animation. Used for the Today hero, writing/reading paths, and learning empty states. Keep dense settings rows free of stickers. Every meaning and action must also be present in text.

## Palette and roles

| Primitive         | Value     | Use                                        |
| ----------------- | --------- | ------------------------------------------ |
| `--palette-paper` | `#FFFFFF` | Background, card, popover, input           |
| `--palette-ink`   | `#161616` | Text, primary actions, key outlines, focus |
| `--palette-muted` | `#595959` | Secondary text, 7:1 on white               |
| `--palette-pale`  | `#F5F5F3` | Quiet surfaces, hover, selected options    |
| `--palette-line`  | `#E4E4E0` | Row separators; never reading text         |
| `--palette-spark` | `#FFD84D` | `--brand-accent`, sticker details          |
| `--palette-alert` | `#B42318` | Error/destructive and active recording     |

All 187 existing color roles have been repointed, including learning, history, library, math, settings, illustrations, focus, and shadows. Changing `--primary` alone is still not a whole-theme recolor: every custom role is deliberately independent. For a future theme, edit the active primitives or repoint existing semantic roles, preserving their names.

`--brand-accent` is separate from `--primary` and `--accent` (hover). Put ink text on yellow. Connected states use text, and the learning header adds a check icon. Error and recording states retain explicit labels. `--separator` is for low-emphasis dividers; `--border` outlines controls and cards. New styles consume semantic roles, not palette literals.

Control borders are 1px, key selection/hero/drawer emphasis is 2px. Focus uses an ink 2px outline with 3px offset. Controls have 44px minimum targets. Mobile uses a five-item bottom navigation, a More menu for secondary sections, and a bottom-sheet provider editor. Selected controls have a border or icon in addition to a surface change. Respect safe-area insets and reduced-motion preferences.

The existing `.dark` utility variant does not implement a dark theme. This change adds no dark-mode switch or dark palette.

## Verification

`npm run check:theme` rejects authored color literals and fixed Tailwind colors outside theme.css. It is included in `npm run check`. System colors, transparent/currentColor, opacity modifiers and semantic color-mix remain available.

Before shipping a theme change, run `npm run check`, `npm run build`, and `npm test`. Inspect desktop and mobile Today, writing/reading, vocabulary, review/history, math/library, all three settings sections and provider dialogs. Check selected, hover, keyboard focus, disabled, loading, error and recording states, long provider/model names, and mobile overflow. Never use real provider credentials for a visual smoke check or generate paid AI practice solely to validate styling.
