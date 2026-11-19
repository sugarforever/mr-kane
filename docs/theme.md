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

## Example: apply an ocean theme

From the repository root, run the following script. It changes the green and
olive palette families to blue, cools the neutral text and shadows, and keeps the
warm illustration accents. Every semantic alias continues to work, so settings,
math, library, and learning styles all inherit the new palette. The default theme
in this PR stays unchanged until you run the example.

```bash
python3 - <<'PYTHON'
import colorsys
import re
from pathlib import Path

path = Path("src/lib/styles/theme.css")
source = path.read_text()
ocean_hue = 215 / 360


def recolor(match):
    token, hex_color = match.groups()
    rgb = tuple(int(hex_color[i:i + 2], 16) / 255 for i in (0, 2, 4))
    _, lightness, saturation = colorsys.rgb_to_hls(*rgb)
    blue = colorsys.hls_to_rgb(ocean_hue, lightness, saturation)
    # Keep white white and preserve existing translucent shadow/backdrop alpha.
    rgb_hex = "".join(f"{round(channel * 255):02x}" for channel in blue)
    return f"{token}: #{rgb_hex}{hex_color[6:]};"


source, count = re.subn(
    r"(--palette-(?:sage|olive|neutral|shadow)-\d+): #([0-9a-f]{6}(?:[0-9a-f]{2})?);",
    recolor,
    source,
)
path.write_text(source)
print(f"Applied ocean theme to {count} palette entries in {path}")
PYTHON
```

Run `npm run dev` and open the URL printed by Vite. You should see blue navigation
and actions, cool pale backgrounds, and blue settings/math selections, while the
pencil and other warm accents keep their original colors. `git diff --
src/lib/styles/theme.css` shows the palette edits; the semantic roles and component
files should have no changes. To try another hue, change `ocean_hue` and rerun the
script. Undo the palette edits in your editor to return to the original theme.

This is an example palette, not a contrast-certified theme. The script preserves
HSL lightness and saturation, which does not guarantee equal perceived contrast
across hues. Review the foreground/background pairs and interactive states listed
below before shipping it.

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
