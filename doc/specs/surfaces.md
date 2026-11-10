# Surfaces and text levels

GG's neutral colours come from one lightness ladder in OKLCH, shared by the three families. The family supplies only the tint; the appearance (Light, Twilight, Midnight) supplies the lightness. Hues (accent, lanes, syntax, status) are separate and covered by `doc/specs/color-vision.md`.

## Planes

The interface is built from a few planes, each a fixed lightness step from the next:

| Plane | Token | Holds |
| --- | --- | --- |
| Ground | `--ground` | app chrome: topbar, navigation, repository footer |
| View bar | `--panel-header-bg` (60% surface, 40% ground) | a view's title bar, toolbars and footer |
| Tile | `--surface` | a view's content |
| Raised | `--raised`, `--popover-surface` | dialogs, menus, sheets, palettes |

Each desktop view is a tile on the ground, with rounded corners and a quiet 1px edge (`--view-edge`, 7% text over the surface). The first tab pill and the last tool sit `--view-bar-inset` (6px) from the tile's sides and top, and the tile radius is that inset plus the pill radius, so their corners nest; labels and icon glyphs still land on the 12px content inset through the pills' padding. Tiles sit `--dock-gutter` apart, and the gutter is the resize handle. The focused tile brightens its edge (`--view-focus-ring`). Inside a view, bars and content differ by plane, and where they meet a hairline (`--view-inner-rule`, 4% text) marks the seam well below the tile's edge. A view's header block (title bar plus toolbar) has one such rule, beneath the toolbar. On a phone the single view fills the screen without a tile.

| L (OKLCH) | Ground | Tile | Raised | Input | Popover |
| --- | --- | --- | --- | --- | --- |
| Light | .955 | .993 | .997 | .993 | .998 |
| Twilight | .225 | .265 | .30 | .28 | .31 |
| Midnight | .17 | .205 | .24 | .22 | .25 |

Light themes keep content brightest and the ground a step darker. Dark themes keep the ground darkest and lift content, then floating layers, toward the viewer.

## Text levels

| L (OKLCH) | Strong `--text-strong` | Body `--text` | Secondary `--muted` | Tertiary `--faint` |
| --- | --- | --- | --- | --- |
| Light | .18 | .27 (.25 cold) | .455 | .53 |
| Twilight | .97 | .92 | .745 | .695 |
| Midnight | .97 | .92 | .735 | .68 |

Secondary text is about 1.8:1 below body text in dark themes and 2.1:1 in light ones, so labels, counts and metadata read as secondary at a glance. Every level still meets WCAG AA (4.5:1) on the strongest background it meets, the hovered selection.

## Tints

Backgrounds and text take a hue and chroma from the family: Warm 85° (0.006 backgrounds, 0.010 text), Neutral none, Cold 250° (0.013 backgrounds, 0.008 text). Light appearances halve the chroma, because a little colour near white reads strongly and leaves the sRGB gamut.

## Checks

The ladder was chosen against the same requirements as the hues: `app/display/vision/palettes.test.ts` (every family, light level and colour vision palette) and `e2e/theme-families.test.ts` (rendered contrast, including hovered and selected rows). When changing a level, run both. Moving body or secondary text also moves the syntax comparisons (`text` and `--diffs-token-comment` against syntax hues) and remote references (`--ref-remote`, which lifts slightly above `--muted` in dark themes for that reason).
