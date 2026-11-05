# Shared UI design sweep

Reviewed global theme, all 31 production Svelte shared controls, display theme/zoom utilities,
the catalogue and DiffViewer. Preserved the existing fonts, compact desktop density,
neutral selection, graph semantics, native fields and fixed panel structure.

Implemented tested solid primary/danger roles; separated graph topology from panel rules and strengthened required
field boundaries; unified opaque menu elevation/radius and drawer scrim; made shared
actions grow with text; raised touch panel/tray controls to 44px; standardized focus
and invalid-field states. The catalogue uses production actions and real diff data,
with selected/disabled/error/loading/empty fixtures and interactive focus/hover states.
Display theme/zoom, metadata/chips, IDs/authors/timestamps, field events, selection and
panel tab keyboard behavior remain represented by existing component coverage.

## Measured verification

Computed browser colors (canvas sRGB conversion), dark / light contrast:

| Pair | Dark | Light |
| --- | --- | --- |
| White / primary default | 5.61 | 5.41 |
| White / primary hover | 4.94 | 6.80 |
| White / primary pressed | 7.34 | 8.47 |
| White / danger default | 6.32 | 5.62 |
| White / danger hover | 5.38 | 6.99 |
| White / danger pressed | 7.63 | 8.77 |
| Field outline / field fill | 3.80 | 3.76 |

Added rendered contrast regression coverage for these action and field states.
After visual review, the owner requested softer graph connectors in both themes.
Final edges are light #b8bfc9 and dark #3c4450 at 1.5px, subordinate to the colored
nodes and selected revision. The earlier 3:1 edge assertion was removed with that
decision; this report does not claim 3:1 contrast for graph connectors.
Shared-control/display/diff tests: 59 passed. Svelte check: zero errors/warnings.
Production build passed (existing large syntax-bundle warning). Cargo fmt and Clippy
passed under Nix after generating frontend assets.

Rendered catalogue at 1440/768/390/320 CSS pixels in both themes: no page horizontal
overflow. Inspected real diff, fields and feedback screenshots. At 200% root text
size on a 768px viewport, shared primary action grew to 50px for its 26px type without
clipping. This is a text-resize probe, not native browser zoom. Production native
WebKit/Tauri, OS-native select popups, external editor content, screen readers and
all repository-dependent error paths require their own environment checks.

Evidence: `/tmp/gg-ui-audit/sol-*-top.png`, `sol-*-states.png`,
`sol-dark-text200.png`, `sol-colors.json`, `sol-graph-ratios.json`. These are local
review artifacts rather than committed product assets. Initial failure screenshots
are retained under `sol-test-failure-screenshots`; the final contrast suite passes.

## Text-size follow-up

Production 200% root text enlargement exposed fixed metadata labels and virtual
history rows. Metadata columns now scale with UI type and wrap labels. `LogPane`
measures one hidden CSS row and shares its height with navigation, virtualization,
rows, station/edge coordinates and scroll anchoring. Tall author/title geometry
scales together with explicit author space; default density is unchanged.

Targeted metadata/history tests: 23 passed, including both enlarged densities,
label/value separation, graph endpoint alignment and fractional reading anchor.
Live 1440px workspace at 200% root text: metadata labels160px, compact rows56px,
tall rows120px, tall station center40px; title and author boxes do not overlap.
Evidence: `/tmp/gg-ui-audit/sol-workspace-text200.png` and
`sol-workspace-tall-text200.png`. Root separately owns the later user-requested
connector color correction; the earlier contrast table describes the initial pass.

Hidden timeline measurement follow-up: a hidden dock panel reports zero CSS height.
The last positive row measurement is retained, so hiding and reopening history cannot
collapse its virtual rows or divide its reading anchor by zero.
Browser scroll anchoring is disabled for the virtual history viewport because its
explicit proportional anchor already owns the scroll correction. Live density
switching from scroll280 now yields exactly600, rather than browser-adjusted589.
