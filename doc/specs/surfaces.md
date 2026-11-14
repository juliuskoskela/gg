# Surfaces and text levels

GG's neutral colours come from one lightness ladder in OKLCH, shared by the three families. The family supplies only the tint; the appearance (Light, Twilight, Midnight) supplies the lightness. Hues (accent, lanes, syntax, status) are separate and covered by `doc/specs/color-vision.md`.

## Planes

The interface is built from a few planes, each a fixed lightness step from the next:

| Plane | Token | Holds |
| --- | --- | --- |
| Ground | `--ground` | app chrome: topbar, navigation, repository footer |
| View bar | `--panel-header-bg` (60% surface, 40% ground) | a view's title bar, toolbars and footer |
| View | `--surface` | a view's content |
| Raised | `--raised`, `--popover-surface` | dialogs, menus, sheets, palettes |

Desktop views share one square-cornered sheet. Neighbouring views meet on a 1px seam (`--dock-gutter`) in `--view-edge` (12% text over the surface), and the seam is the resize handle. The same hairline edges the sheet where it meets the app chrome: the topbar, the navigation rail and the footer; the sheet runs to the window's trailing edge. Views draw no edge of their own at rest. The focused view traces its whole edge over the seams in `--view-focus-ring` (32% text). The first tab pill and the last tool sit `--view-bar-inset` (6px) from the view's sides and top; labels and icon glyphs still land on the 12px content inset through the pills' padding. Title bars share one height, so across a row of views they read as one band broken by seams. Inside a view, bars and content differ by plane, and where they meet a hairline (`--view-inner-rule`, 4% text) marks the edge well below the seam. A view's header block (title bar plus toolbar) has one such rule, beneath the toolbar. On a phone the single view fills the screen without a seam.

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
