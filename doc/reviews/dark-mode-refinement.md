# Dark-mode hierarchy refinement

The previous dark palette gave text and input outlines similar emphasis, while graph markers and references did not have a clear order. This pass follows the local frontend-design skill and keeps the existing IBM Plex Sans / JetBrains Mono typography and workspace layout.

## Visual roles

| Role | Dark value | Purpose |
|---|---|---|
| Ground | `#0b0c0f` | Repository shell and navigation |
| Surface | `#111317` | Graph and diff canvas |
| Raised | `#1a1d23` | Menus and transient surfaces |
| Primary text | `#bdc4cf` | Descriptions and reading content |
| Strong text | `#e0e6ef` | Selected description and headings |
| Secondary text | `#929ca9` | IDs, reference labels and metadata |

Nodes use brighter neutral/green strokes than connecting branches. The selected revision adds an accent ring; working-copy, immutable and conflict semantics remain distinct. Text is opaque and role-colored, rather than applying opacity to containers and inadvertently dimming their children.

Reference tags use low-opacity role-tinted fills and borders: blue local bookmarks, quieter remote bookmarks, violet workspaces and warm tags. Names, glyphs, lifecycle indicators, conflict warnings and accessible labels continue to identify their meanings. Drop targets and context states remain explicit.

Controls have a dedicated inset surface, softer resting borders, distinct hover and pressed colors, and an accent focus boundary with a restrained outer halo. Disabled borders recede. Native select behavior, touch dimensions and reduced-motion behavior remain intact.

## Review and evidence

Baseline and after screenshots, pointer/focus states and measured contrast are retained under `.taste-skill/dark-refinement/`. The after capture of the actual GG+ repository includes divergent changes, workspaces, local/remote bookmarks, file navigation and syntax-highlighted diffs. Isolated fixture review checks dark/light and narrow-screen behavior without repository mutations.

The resting dark input boundary is approximately 3:1 against its fill, versus roughly 5:1 before. Primary and secondary text remain above 4.5:1 on their ordinary surfaces. This is a focused visual refinement; it does not establish screen-reader behavior or platform equivalence on every operating system.

Independent rendered review measured 3.16:1 resting input boundaries, 3.53:1 graph branches, and at least 7.19:1 nodes. It caught and prompted fixes for selected-chip text and hover overriding focused-input borders. The corrected selected/hover chip text measures 7.01:1 / 6.52:1, and focused borders retain their accent while hovered in dark and light modes. Sampled 390px and 1440px layouts showed no horizontal overflow.

The full 183-test suite passed; final CSS contrast fixes were checked again in the browser and through the frontend suite. Frontend build/type checks, Rust formatting and Clippy also pass. Native screen-reader and cross-platform rendering were not retested in this visual pass.
