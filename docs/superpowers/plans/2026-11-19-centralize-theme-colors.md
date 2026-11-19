# Centralize theme colors

Goal: Make all authored application colors editable in one theme file without changing the current appearance.

Architecture: `src/lib/styles/theme.css` owns palette values, semantic aliases, and Tailwind mappings. Existing CSS keeps its selectors and layers and consumes aliases. Component-specific shades remain explicit to preserve appearance.

- [x] Add a color-literal guard and verify that it rejects the existing scattered colors.
- [x] Extract palette and semantic tokens; migrate app.css, math, and IrmoLibrary, retaining effective border and alpha values.
- [x] Document palette editing and intentional component variations.
- [x] Verify exact source color equivalence, run the color guard, Svelte checks, build, and test suite; review the diff and open a PR against main.

Review focus: CSS layer precedence, legacy muted text versus shared muted text, named white, translucent colors, and decorative gradients. No layout or dark-mode changes.
