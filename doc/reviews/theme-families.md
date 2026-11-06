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


## Verification

The browser matrix covers all nine variants at 1440, 768, 390 and 320 px, persisted choices, cross-window synchronization, legacy light/dark preferences, and the production component gallery. Palette roles are measured after the browser resolves `light-dark()` and `color-mix()`.

Coverage includes text, status and syntax on content, raised, input and popover surfaces; selection metadata; graph labels; primary-action fills in all states; and neutral focus against selection. Disabled text and decorative rules are excluded from text thresholds. Separators use 7% ink, panel borders 16%, and graph connectors 20%; these stay subordinate to text and nodes. Field focus remains one neutral stroke.

| Family | Light minimum text contrast | Twilight minimum text contrast | Midnight minimum text contrast |
| --- | ---: | ---: | ---: |
| Cold | 4.69:1 | 4.63:1 | 5.52:1 |
| Neutral | 4.78:1 | 4.61:1 | 5.33:1 |
| Warm | 4.77:1 | 4.61:1 | 4.69:1 |

Measured text pairs meet 4.5:1; the focus pair meets 3:1. Twilight metadata, graph label grading and the Warm solid hover were adjusted from the first pass to meet these targets. Contrast results and screenshots are generated under `e2e/results/themes/`.
