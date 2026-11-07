# Colour vision palettes

*Settings → Appearance → Color vision* replaces every hue in the interface with a palette checked against simulations of a colour vision deficiency. Backgrounds, text and the light level stay with the chosen family, so each palette works with Warm, Neutral and Cold, in Light, Twilight and Midnight.

| Option | For | Simulated with |
| --- | --- | --- |
| Typical | the family's own hues | — |
| Protanopia | protanopia and protanomaly (red-weak) | Viénot 1999, Brettel 1997, Machado 2009 at severities 0.3, 0.6, 0.9 |
| Deuteranopia | deuteranopia and deuteranomaly (green-weak) | Viénot 1999, Brettel 1997, Machado 2009 at severities 0.3, 0.6, 0.9 |
| Tritanopia | tritanopia and tritanomaly (blue-weak) | Brettel 1997 at full and half severity |
| Monochromacy | rod and cone monochromacy | photopic luminance and scotopic luminance |

Any palette other than Typical also turns on `+`/`−` markers beside changed diff lines, so additions and deletions never depend on colour alone.

## Models

All simulations act on linear sRGB. Constants are copied from their sources into `app/display/vision/models.ts`:

- **Viénot, Brettel & Mollon (1999)** and **Brettel, Viénot & Mollon (1997)**, as implemented in [libDaltonLens](https://github.com/DaltonLens/libDaltonLens) (sRGB decoding, Smith & Pokorny cone fundamentals, white as the neutral axis).
- **Machado, Oliveira & Fernandes (2009)**, table 1 of the [authors' page](https://www.inf.ufrgs.br/~oliveira/pubs_files/CVD_Simulation/CVD_Simulation.html).
- **Scotopic luminance** after Larson, Rushmeier & Piatko (1997), normalised so white stays white.

The choice follows the [DaltonLens review](https://daltonlens.org/opensource-cvd-simulation/): Viénot and Brettel are sound for protanopia and deuteranopia; Brettel is the only valid choice for tritanopia (Viénot and Machado are not used for it); Machado is better suited to anomalous trichromacy than to dichromacy, so it supplies the intermediate severities. A palette must pass *every* simulation listed for its deficiency, and typical vision too, since other people use the same screen.

Complete achromatopsia is rod vision, so scotopic luminance is the closer model; photopic luminance stands in for cone monochromacy and for anyone viewing in greyscale. Both must pass.

## Requirements

Defined in `app/display/vision/requirements.ts`. Colour differences are CIEDE2000 (Sharma, Wu & Dalal 2005) between simulated colours; contrast is WCAG 2.

| Group | Pairs | Minimum ΔE00 | Monochromacy |
| --- | --- | --- | --- |
| Status | positive–negative, negative–warning | 20 | 10 |
| Status | positive–warning | 20 | 8 |
| Accent against danger | accent–negative | 15 | 6 |
| References | bookmark, tag, workspace, remote chips | 12 | by icon |
| Syntax | text and the four syntax hues pairwise; comments against each hue | 8 | by position |
| Neighbouring graph lanes | lane *n* and *n*+1 | 10 | by position |
| All graph lanes | every pair | 5 | by position |
| Diff lines | addition and deletion tints, plain and emphasis | 5 | by `+`/`−` |
| Primary against destructive | solid accent and danger buttons | 10 | by label |

| Contrast | Foreground | Background | Minimum |
| --- | --- | --- | --- |
| Text hues | every hue drawn as text or strokes | ground, surface, raised, popover, input, panel header | 4.5 |
| Diff text | text and the line's own status colour | its addition or deletion tint | 4.5 |
| Solid buttons | button text | solid accent and danger fills, rest, hover and pressed | 4.5 |

**The monochromacy exception.** On dark surfaces, the text-contrast floor puts every hue at CIELAB L\* ≥ 69 for the darkest legible red. Three lightness levels 10 apart can't fit between that and white while the green stays green enough to tint its diff lines. So danger keeps the full separation from both other states, and positive–warning, two non-danger states, needs 8. Warnings also carry their triangle icon.

## How the palettes were made

The palettes were found by search, not by hand. For each deficiency and mode, a hill climb over OKLCH lightness, chroma and hue first removed every shortfall against the requirements, across all three families and both dark depths. It then minimised the average CIEDE2000 distance from the Neutral family's colours, role by role, so each palette is the smallest departure from GG's look that passes. Semantic roles stay in conventional hue ranges: in the red/green palettes additions are blue and deletions vermillion; in the blue palette additions are green-teal and deletions red; in monochromacy deletions are the darkest status and additions the lightest, an order that holds in both rod and cone vision. Chroma has a floor so status colours never drift to grey.

Several results sit exactly at a threshold, since the second objective pulls toward the family colours until a requirement stops it.

## Checks

`app/display/vision/palettes.test.ts` renders a `#shell` for every deficiency × family × light level (36 combinations), reads each colour back with `getComputedStyle`, so `color-mix()` and `light-dark()` resolve exactly as the browser draws them, and runs the requirements. It also checks that every hue is replaced (none left to the family) and that Typical keeps the family's hues. `color.test.ts` checks CIEDE2000 against Sharma's reference pairs and the WCAG contrast formula.

When adding a hue token, give it a value in each colour vision block in `app/display/palettes.css` and, if it carries meaning, a rule in `requirements.ts`.

## Limits

- Simulations are models. Protan and deutan models are validated on few observers; tritan models are rarely validated at all.
- WCAG 2 contrast uses photopic luminance; rod monochromats perceive contrast differently.
- Blue-cone monochromacy is not modelled separately; its S-cone and rod vision lies between the photopic and scotopic checks.
- The checks cover colour roles, not every component. Components that mix their own tints from these roles inherit the guarantees only approximately.

## Typical palettes

The same requirements, applied to the families' own colours under typical vision, find near-identical graph lanes (lane 1 against lane 6 at ΔE00 0.7; lane 2 against lane 3 at 1.0), bookmark and workspace chips at 4.2, and accent against negative at 8.4. The typical palettes are outside this feature and are not tested against these rules.
