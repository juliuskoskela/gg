# GG+ visual refinement

GG is a working surface for reading and reshaping Jujutsu revisions. The visual
emphasis belongs to the selected revision and its code. Graph navigation, file
navigation and tools support that work within the existing adaptive layout.

This pass applies `anthropics/skills@frontend-design` to the existing visual
direction. It keeps the palette, typefaces and layout established in earlier
passes. A new decorative identity would compete with the graph and syntax.

## Tokens

| Role | Light | Dark |
| --- | --- | --- |
| Work surface | `#ffffff` | `#18181a` |
| Shell | `#f6f6f9` | `#111113` |
| Text | `#18181a` | `#c9cbd0` |
| Metadata | `#525254` | `#a5a7ae` |
| Structural rule | `#e6e6e9` | `#252527` |
| Control border | `#dadadd` | `#38383a` |
| Accent | `#215a8a` | `#9ebbd4` |
| Graph connection | `#89898b` | `#666a70` |
| Mutable marker | `#6b6b6e` | `#84888f` |
| Immutable marker | `#587963` | `#789181` |

IBM Plex Sans carries the interface; JetBrains Mono is reserved for code, revision
IDs and revsets. The scale is 12px metadata, 13px interface text, 14px body text,
and a 16px selected-revision description in the header. Graph titles use regular weight with a
medium selected title. The details disclosure contains the description title at 13px, with regular
14px body text below; the selected-revision header carries the medium-weight emphasis.

## Layout and visual weight

```text
Repository / view                                   Fetch Push Undo
History toggle          Revision identity + actions       Revision toggle Files toggle
Revset                  Description title + details       File tree
Revision list           Diff                              File tree
```

Content stays left aligned. Existing pane focus and mobile forward/back navigation remain available.
Revision details stay above the diff; their title remains visible when collapsed. Description editing becomes an icon
on narrow revision panes so the description can use the available width.

The changed-file tree belongs to the selected revision. Repository navigation can
expand or collapse without moving, hiding or remounting it. Both the Files
control and the current filename open the same panel. On desktop and tablet it
docks on the right, spanning the description and diff; below the 768px viewport
breakpoint it overlays that full revision area from the right. Phone opening and closing does not change the desktop visibility
preference. Search, file selection and folder expansion stay with the panel.

- Structural dividers use `--rule`; editable controls use `--border`.
- The splitter keeps its interaction area with one visible pixel at rest.
- Resting controls are transparent, borderless and have no shadow. Floating surfaces have one border and a
  shadow without a second outline painted into it.
- Controls share 8px horizontal padding and a 6px icon-to-label gap. Actions and
  icon controls have a 32px minimum target, growing to 44px for touch. Hover,
  pressed, selected and disabled states use the shared neutral roles.
- Select labels and picker arrows keep separate space. Long labels truncate
  within the trigger; picker options retain their full text. The remote picker
  has a 96px minimum on desktop and a 76px width on phones, with the full remote
  name available in its tooltip. Select triggers do not inherit action padding.
- Selection uses the shared neutral rounded fill, with no accent stroke.
- Icons use Feather at 16px with a 1.75 stroke on the 24px viewbox, including
  custom panel controls. Chevrons replace platform-dependent triangle glyphs.
- Graph connections and markers share a 1px stroke. Markers have a 4.5px radius;
  edge endpoints share that radius so connections meet the circle cleanly.
  Grey hollow markers mean mutable revisions; subdued green fills mean immutable
  revisions. Working copies retain a brighter green center or amber for another
  workspace. Immutability is independent of release tags. Diff additions,
  deletions and conflicts retain semantic colors; modified file icons use the
  neutral foreground.
- Bookmarks size to their content. Dashed outlines continue to mean disconnected
  bookmarks. Diff alignment gaps retain a quieter hatch so blank alignment can
  be distinguished from source lines.
- Saved-view selects truncate long labels while keeping the picker arrow visible.
  The native select remains the form and keyboard control; its button uses
  [progressively enhanced selected content](https://developer.mozilla.org/en-US/docs/Learn_web_development/Extensions/Forms/Customizable_select).

The refinement keeps the product's own revision graph and actual repository
content as its distinguishing elements. No sample data or new UI dependency is
introduced.

## State roles

The steel-blue accent ramp spans OKLCH hue 238.5–247.8°. Focus, primary actions
and syntax keywords use it. Change-ID prefixes use text ink. Graph nodes and edges
have independent roles so dense history does not inherit the text contrast.
Filled green and hollow grey nodes distinguish immutable and mutable revisions.
Working-copy green, other-workspace amber, conflict red and divergent-ID red
retain their meanings. Context adds a separate 1px neutral node ring;
legal drop targets add a 2px inset ink outline without changing their background.
Functions and diff selections use neutral roles. The old Catppuccin aliases are
removed.

Light metadata uses a 95% mix of neutral-600 with neutral-900: about `#525254`,
7.23:1 against the light ground. The specified `#555557` measured 6.90:1, so the
role is slightly darker while the neutral ramp stays intact. Placeholders alone
use neutral-400. Controls and navigation use 13px text; IDs, counts, emails,
timestamps and diff text use 12px. Only the revision header uses 16px. Chrome
shares a 12px inset and a 40px desktop header row, enlarged for touch targets.

Dark-mode text uses silver instead of near-white, with a quieter metadata step.
Comments and punctuation use that same metadata role. The direction follows
[Primer's separation of foreground, border and semantic roles](https://primer.style/product/getting-started/foundations/color-usage/)
and [Svelte Flow's independent node and edge tokens](https://svelteflow.dev/learn/customization/theming).
The existing SVG renderer stays; no graph library or layout migration is needed.
