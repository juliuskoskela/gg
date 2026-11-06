# Cold, neutral and warm

Three color families, each with Light, Twilight and Midnight appearances. Twilight lifts the dark surface ladder; Midnight uses the deeper reference grounds. Text, status and syntax keep their roles across both dark depths. Color family and appearance are independent settings: changing from Dark to Light keeps the selected family. Existing `gg.ui.theme` values and repository light/dark overrides remain valid. Warm is the family fallback, preserving the existing app's quiet charcoal direction. System appearance can be restored explicitly.

## Direction and references

Cold uses blue slate from Digimuoto's dark palette: ground #11161d, surface #181e27, ink #d5dbe3, muted #a9b2bf, blue #90afe1. The local repo-docs checkout and its current refs contain Cortex palettes rather than a file named `digimuoto-dark`; its cool surface approach and the actual Digimuoto dark tokens are the references. Sources: `~/Repos/repo-docs/template/src/styles/themes/` and `~/Repos/digimuoto.com/src/styles/tokens.css` / `src/lib/shiki-themes.mjs`.

Neutral uses achromatic editor grays: ground #181818, surface #1f1f1f, raised #262626, ink #cccccc, muted #a6a6a6, blue #9ac2e8. Reference: Microsoft's Dark Modern theme (https://github.com/microsoft/vscode/blob/main/extensions/theme-defaults/themes/dark_modern.json). GG+ keeps its own restrained selection and neutral focus treatment.

Warm follows the Claude dark direction: ground #1f1e1d, surface #262624, raised #30302e, ink #dedcd1, muted #b2aea3, clay #dfaa91. These are a GG+ interpretation, not a claim of exact current Claude tokens; the live Claude site did not expose a usable stylesheet during reference inspection.

All light variants inherit Paper's material: ground #eee9e1, surface #f5f2ec, raised #f6f3ed, ink #1d2127 and muted #4d5560. Cold nudges the paper toward cool stone, Neutral reduces the sand chroma, and Warm retains the original Paper warmth. Syntax colors follow Digimuoto Paper's darker ink roles.

## Layout and principles

The Settings Appearance section offers three small palette previews, then Light / Twilight / Midnight. Each preview shows the same compact workspace geometry. It is a functional comparison, not new chrome throughout the app.

    Appearance
    [ Cold preview ] [ Neutral preview ] [ Warm preview ]
    Appearance                         [Light] [Twilight] [Midnight]

Keep IBM Plex Sans for UI and JetBrains Mono for code. Keep existing spacing, radii and layout. Family changes travel through semantic roles, including popovers, fields, graph, diff and syntax. Separators remain soft, interactive overlays remain relative to the current ink, and keyboard focus remains a single neutral stroke. Stronger accents belong to actions, never panel outlines.

The first plan was checked against the brief: the color choices are tied to the requested references; the existing app layout is preserved. The light family differences are intentionally restrained so all three still feel like Paper.


## Color identity and readability

Workspace identity uses one JJ-inspired GG+ blue across all families. The source hue comes from `#309fdf` in [jj's logo](https://github.com/jj-vcs/jj/blob/main/docs/images/jj-logo.svg); this is a GG+ interpretation, not a claim that jj publishes a single official brand token. The shared `--brand` foreground is `#01557f` in Light and `#8dd1ff` in both dark depths. A pressed foreground (`#014e75` / `#aadcff`) supports the stronger overlay in the current-workspace picker. The hue stays blue as its luminance adapts to the surface.

Apply this role to the workspace name before `@`, including `default`, the current workspace name in the picker, workspace badges, working-copy navigation icon, workspace graph stations and their revision prefixes. Conflict red takes priority on conflicted revision text; workspace identity is no longer borrowed from positive green or the family's violet. Workspace names, the `@` badge and concentric station shape preserve meaning without depending on color alone.

Syntax and graph hues are graded in OKLCH for contrast, then stored in the existing hex notation. Strings, keywords, constants and functions have distinct, stronger hues; each family retains its character. Graph stations and revision prefixes use the same text-grade lane token directly. Reference labels use their role directly too. Avoid repeated gray/white mixing: it erased the hue even when the original palette passed contrast. Reference backgrounds stay at 4% tint and their borders remain subtle.

Keep connectors neutral at 20% ink, content rules at 7%, and borders at 16%. Title bars sit 72% toward the content surface from the outer ground, with quieter 5% rules and 10% tool-group outlines; see [panel spacing](panel-spacing.md). Greater syntax and station chroma must not make the surrounding grid heavier. Keep neutral selection and a single neutral focus stroke. Brand blue identifies workspace context; it does not recolor panel boundaries or focus rings.

## Verification

The browser matrix covers all nine variants at 1440, 768, 390 and 320 px, persisted choices, cross-window synchronization, legacy light/dark preferences, and the production component gallery. Palette roles are measured after the browser resolves `light-dark()` and `color-mix()`.

The expanded contrast checks cover text, status, references and syntax against content, raised, input, popover, selected and hovered surfaces, including addition/deletion lines and word emphasis. The browser also measures rendered text in Settings, repository navigation (rest, hover and pressed), the real syntax highlighter's shadow DOM, revision prefixes and reference badges over composited translucent backgrounds. It checks selected/hovered bookmark, tag and workspace rows. Brand consistency is asserted across families and between the workspace name, graph station, prefix and badge; lane station and prefix colors must match.

Measured text pairs meet 4.5:1; focus meets 3:1. The matrix contains 7,164 token comparisons and over 10,000 rendered text samples. Disabled text and decorative separators are excluded from text thresholds. These are checks of the documented surfaces and states, not a claim of complete application accessibility certification. Contrast results and screenshots are generated under `e2e/results/themes/`.

| Family | Light minimum text contrast | Twilight minimum text contrast | Midnight minimum text contrast |
| --- | ---: | ---: | ---: |
| Cold | 4.71:1 | 4.65:1 | 5.52:1 |
| Neutral | 4.73:1 | 4.65:1 | 5.33:1 |
| Warm | 4.76:1 | 4.69:1 | 4.69:1 |

Values are the minimum across token comparisons and rendered text samples, including menus and hovered selection states. The tests also verify the unchanged appearance behavior and production component interactions. Build, Svelte checks, all 206 component tests, Clippy and formatting pass.
