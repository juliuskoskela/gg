# GG+ workspace design system

## Direction

The revision graph is GG’s identity and working context. Its real topology, selected revision and working-copy marker should remain the visual anchor while an inspector reveals detail. Use IBM Plex Sans / JetBrains Mono, matching the owner’s `~/Repos/repo-docs` documentation template, neutral light and dark surfaces, and muted green graph semantics. Do not import terminal-dashboard cards, financial status colors, ornamental grids or a new font system from researched examples.

Desktop stays one workspace: graph and contextual inspector share one revision selection. Narrow layouts use one shared revision sheet with collapsed and half states; opening full inspection navigates to the canonical full route. Full is a destination, not a third oversized nested overlay. Keep graph state and scroll when returning. Sheet dragging begins only at its handle; scrolling descriptions, files or diffs must never move the sheet.

The hierarchy is repository chrome → revision graph → selected revision → contextual files/diff/actions. The graph’s circles and edges carry the memorable visual form. All surrounding chrome stays quiet. Use the same selected-row treatment across graph, files and navigation, while preserving the selected revision marker and text rather than relying on color alone.

## Exact additions to the incumbent tokens

| Token | Value | Role |
|---|---|---|
| `--space-6` | `32px` | larger structural separation |
| `--touch-target` | `44px` | touch controls and sheet handle hit area |
| `--focus-width` | `2px` | common keyboard focus width |
| `--focus-offset` | `2px` | common keyboard focus offset |
| `--motion-feedback` | `140ms` | existing hover/press feedback |
| `--motion-sheet-duration` | `220ms` | sheet settle within requested 180–250ms |
| `--motion-sheet-ease` | `cubic-bezier(.2, .8, .2, 1)` | prompt start and quiet settle |
| `--sheet-radius` | `12px` | exposed upper sheet corners only |
| `--inspector-peek-height` | `72px` | handle plus one revision identity row |
| `--sheet-half` | `50%` | half of the available workspace, not device screen |
| `--sheet-handle-width` | `32px` | visible drag indicator |
| `--sheet-handle-height` | `4px` | visible drag indicator |
| `--sheet-surface` | `var(--surface)` | theme-parity surface |
| `--sheet-border` | `var(--border)` | crisp boundary against graph |
| `--sheet-shadow` | `0 -4px 20px #09090b14` / `0 -4px 20px #09090b38` | light/dark separation |
| `--focus-ring` | `var(--accent)` | preserve existing high-contrast focus color |

No palette replacement: current blue accent remains for links/focus, muted green remains meaningful in the graph, red/green diff colors remain semantic. Selection is neutral. Apply 44px targets for coarse input and narrow sheet controls rather than inflating all desktop rows. At the default 16px browser setting, desktop UI is 13px, body 14px and code 12px. At widths up to 600px, UI is 14px, body 15px and code 13px. These semantic roles use rem units, with unitless prose leading and proportional diff leading. Mobile editable fields use at least 16px to avoid focus zoom. These are density/readability choices, not WCAG minimum font sizes. Use available-workspace height and safe-area bottom inset for sheet geometry.

Motion is interruptible, never a page entrance effect. Animate transform for sheet movement. Reduced motion resolves immediately while preserving the final state and focus. Focus must remain visible above sticky content; the collapsed handle offers a named button alternative to dragging. The half sheet is nonmodal and must not trap graph interaction; the full route restores ordinary page navigation.

## Initial critique and evidence

Method: adapted manual single-context review, not a complete upstream Impeccable critique invocation. Current baseline supplied by the studio at `.taste-skill/studio/baseline/mobile-fold.jpg` and `desktop-fold.jpg`; historical screenshot `.taste-skill/ui-sweep/desktop-light.png` is not current evidence. Browser CUA inventory returned no browsers/apps. Source review covers `App.svelte` and `global.css`.

Strengths: real revision topology dominates the narrow screen; compact Plex text fits meaningful revision descriptions; the selected working-copy row has a neutral fill plus graph marker. Existing semantic colors, light-dark token pairs and reduced-motion rule are a sound base.

Priority findings:

1. P1: `App.svelte` hides `.log-region` when `.compact.show-detail` is set. Inspection erases spatial context. Shared collapsed/half sheet must keep the graph behind it and reserve the full route for deep inspection.
2. P2: narrow top controls consume roughly 190px before the first revision. Avoid adding a second mobile title/action row inside the sheet when the same identity is already visible. Collapsed content needs only revision identity and expansion affordance.
3. P2: mobile baseline shows 32px desktop-size controls. Shared sheet header actions need 44px hit areas, explicit names and clear focus. Preserve dense graph text while making its interactive row hit area sufficient.
4. P2: the existing binary history/change state does not describe a partially open inspector. Sheet state must be separate from revision selection, canonical route and pane mode so selections update one inspector rather than opening duplicate layers.
5. P3: 140ms feedback exists as a raw global value. Introduce modest reusable motion/focus tokens without broad visual churn.

Verification still required after implementation: 320/390px widths, short landscape, 880px transition, both themes, long descriptions, selected graph row visibility, half-sheet inner scroll, handle pointer cancellation, keyboard expansion/collapse, route back restoration and reduced motion. A screenshot proves layout, not touch dragging.

## Research provenance and adopted guidance

Exact raw documents and SHA-256 hashes are archived in `.taste-skill/studio/skill-research/sources.json`. Retrieved 2026-11-05 over HTTPS; no installer or external executable run. Current Impeccable upstream places the requested commands under `skill/reference/*.md`, not separate command `SKILL.md` paths.

- [Impeccable shape](https://github.com/pbakaus/impeccable/blob/main/skill/reference/shape.md): adopt explicit job, outcome, states, boundaries and structural thesis. Override interview/stop cadence because the user already supplied detailed direction and requested implementation.
- [Impeccable critique](https://github.com/pbakaus/impeccable/blob/main/skill/reference/critique.md): adopt product specificity, cognitive load, hierarchy, evidence and priority findings. This scoped review does not claim its two-agent assessments, detector, overlay or heuristic score; those tools were not installed or invoked. No synthetic score or overlay claim.
- [Impeccable distill](https://github.com/pbakaus/impeccable/blob/main/skill/reference/distill.md): adopt removal of redundant identity/action chrome, progressive disclosure and no nested cards. Override generic single-column/full-width advice where keeping the graph and inspector together is the product requirement.
- [Impeccable adapt](https://github.com/pbakaus/impeccable/blob/main/skill/reference/adapt.md): adopt context-sensitive restructuring, safe areas, coarse-input targets, consistent IA and separate gesture evidence. Override automatic bottom navigation: GG’s narrow view is a graph workspace with shared contextual sheet.
- [Impeccable audit](https://github.com/pbakaus/impeccable/blob/main/skill/reference/audit.md): adopt verifiable contrast/focus/target/theme/responsive checks, severity labels and no unverified allegations. No full audit score until those checks exist.
- [Impeccable polish](https://github.com/pbakaus/impeccable/blob/main/skill/reference/polish.md): adopt incumbent-system preservation, narrowest correct fix, full-path verification and functional-before-cosmetic triage.
- [UI UX Pro Max SKILL](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill/blob/main/.claude/skills/ui-ux-pro-max/SKILL.md): adopt priority order (accessibility, touch, performance), semantic tokens, meaningful motion and detection of actual Svelte stack. Read its quick-reference and pro-rules as supplemental rules. Override new-system generation/database search because this is incumbent-system adaptation, no upstream scripts installed, and the brief fixes palette/type. The native-only pt/dp table is not a CSS-pixel requirement; use 44 CSS px as the chosen web touch target. Do not claim a database recommendation.

## Compact graph rows

The graph uses one 44px row per revision, with change ID, description and references vertically centered on the node. Repeated author rows are removed; authorship remains in preview and revision details. SVG node centers, edge endpoints, virtualization and keyboard reveal all use the shared `revisionRowHeight`. This keeps touch targets usable and avoids a second responsive graph geometry. Configurable columns remain a future presentation option rather than a new permanent toolbar.

The desktop Files divider uses the same quiet rule and visible focus treatment as the graph divider. Its larger invisible hit area supports pointer use without adding visual weight. A keyboard user can resize it with arrows or jump to the limits with Home and End.

## Integrated control and status audit

The follow-up rollout shares action geometry/states across links, buttons and panel toggles; primary action styling is a variant, not a separate interaction model. Inputs have semantic boundary/focus tokens; narrow editing fields use 16px text. Forced-colors preserves selection and focus. Rendered component tests verify 44px graph/touch targets, centered graph ID/description, and measured light/dark text/status contrast at least 4.5:1 and focus/control boundaries at least 3:1 against ordinary and selected surfaces. These selected component checks do not constitute whole-application WCAG certification.

Revision status names cover working copy, immutable, conflict and divergence; bookmarks expose tracked/untracked, sync/deletion and conflict state through text/accessibility names and compact glyphs. Author remains in preview/Details, leaving the graph's single 44px line aligned and compact. Full inspection keeps stable Back/identity/actions and drops the duplicate Changes count. Secondary repository tools use the same surfaces and type roles as the inspector.

## Font provenance

The UI and code stacks match `repo-docs/template/src/styles/palette.css`: IBM Plex Sans with platform sans fallbacks, and JetBrains Mono with SF Mono/Menlo/Consolas fallbacks. Fonts are bundled locally for native/offline use. JetBrains Mono normal weights 400, 500 and 600 are the unmodified official webfonts from [JetBrains](https://github.com/JetBrains/JetBrainsMono/tree/master/fonts/webfonts); its SIL license accompanies the assets. Interface text keeps the existing Plex Sans 400/500/600 faces. Font synthesis is left available for unsupported weights, italics and fallback scripts rather than disabled globally. The shared code token reaches the diff renderer’s shadow styles as well as revision identifiers.

Graph identifier columns scale with the font so enlarged identifiers cannot overlap revision descriptions.

The final [accessibility and typography audit](accessibility-typography-audit.md) records measured contrast and browser zoom. Fixed-height chips and headings now grow with text, the Full identity yields space to its action controls, and virtual file rows measure the current type scale before calculating offsets.
