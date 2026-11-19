# Theme colors

Edit `src/lib/styles/theme.css` to change the application palette. It is imported
once by `src/app.css`; Svelte component styles inherit the same custom properties.
No runtime theme provider is needed.

The file has three sections:

1. **Palette values** hold every literal color, grouped into neutral, sage, olive,
   warm, and translucent shadow families. Numbers are stable identifiers ordered
   from dark to light in the initial palette, not standardized contrast steps.
   Keep their identifiers stable when changing values.
2. **Semantic roles** map colors to their use. The existing shared roles
   (`--background`, `--foreground`, `--primary`, `--card`, `--border`, etc.) remain
   the public interface for shared UI components. Custom roles describe sidebar,
   learning, recording, settings, math, library, and illustration colors.
3. **Tailwind mappings** expose shared roles as `bg-primary`, `text-foreground`,
   `border-border`, and similar utilities. Add a mapping only when a new role
   needs a reusable utility; plain CSS can use `var(--role)` directly.

For a whole-theme recolor, update the palette families, including warm illustration
colors and shadows. Changing `--primary` alone changes shared primary controls;
custom components deliberately retain distinct shades through their own roles.
For a targeted change, repoint a semantic alias. For example, point
`--settings-primary` at `var(--primary)` to make settings selection match shared
primary controls, or change `--surface-paper` to recolor the warm panels.

The initial extraction preserves every effective color. It intentionally does not
collapse nearby shades: white shared cards and warm paper panels remain distinct,
as do shared muted text and legacy fine print. `--border` retains the effective
unlayered value; the shadowed base-layer definition has been removed. The unused
legacy cream/coral variables and the old green alias have also been removed.
Illustration pencil stops, recording-active colors, focus outlines, native control
accents, and translucent shadows/backdrops are included in the theme.

When adding styles, consume an existing semantic role first. If the role is new,
add an alias here and reuse an appropriate palette value. Add a palette literal
only for a deliberately different shade. Do not put color literals in page or
component CSS. `npm run check:theme` (also included in `npm run check`) rejects hex,
CSS color functions, named white/black values, and fixed Tailwind palette utilities
outside the theme file. System colors `Canvas`/`CanvasText`, `transparent`,
`currentColor`, opacity modifiers, and semantic `color-mix()` remain available.

The existing `.dark` utility variant does not constitute a dark theme. Add a
complete semantic override separately if dark mode is introduced; this extraction
does not add a dark-mode switch or change the cascade layers of component styles.

Before shipping a palette change, run `npm run check`, `npm run build`, and
`npm test`. Review reading, history, math, library, settings sections, dialogs,
and popovers at desktop and mobile widths, including hover, keyboard focus,
selected, disabled, error, and recording states. Recheck contrast for foreground /
background pairs; palette step numbers do not imply contrast guarantees.
