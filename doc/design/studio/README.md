# GG+ workspace design studio

**Delivery history, 2026-11-05:** the first delivery established an inspector foundation, not completion of the full product brief. The [full-scope delivery plan](full-scope-plan.md) maps every original section to implementation, ownership and remaining platform acceptance gates. The integrated result now passes 131 frontend/browser tests and 210 Rust tests. Historical reports below remain evidence for their stated scope; test counts do not establish full production acceptance.

This iteration treats the revision DAG as the workspace, and inspection as a reversible change in depth. The acceptance gate is working repository interaction, not a collection of mock screens.

## Principles and gates

- Selecting inspects; Edit changes the working copy. Commands must preserve that distinction.
- Compact browsing keeps the graph mounted, measurable and scrollable behind a half-height inspector. Closed, peek, half and full states have buttons as well as handle-only gestures.
- Full inspection shares the existing revision query, description editor, file selection and diff implementation. Returning preserves graph position; closing a surface does not clear selection.
- One controller owns workspace presentation. Repository events and selection remain authoritative in Shell; layout preferences cannot force a mobile mutation or navigation.
- Repository tools use a registry and discovery surface. They do not each acquire a permanent navigation button. Revision commands share availability and execution across their surfaces.
- Neutral surfaces, IBM Plex Sans / JetBrains Mono type and graph geometry carry the visual identity. Color communicates selection and repository state; signs and labels carry the same meaning without color.
- Validate 360, 390, 430, 768, 1024 and 1440px, wider desktop, light/dark, reduced motion, keyboard, coarse pointer, rapid selection and interruption. Use isolated repositories for mutations.
- Preserve existing jj operations, native/web transport, graph virtualization and keyboard resizing. Build, typecheck, tests, formatting and Clippy must pass before completion.

## Evidence and responsibilities

Sol 6.1: mobile alternatives, visual language, independent adversarial evaluation. Terra 6.1: architecture, jj research, accessibility/quality. The harness permits three concurrent specialists alongside the director, so roles run in waves. Evaluations by agents are simulated usability evaluations; Playwright observations are browser measurements, not human testing.

The full-scope implementation evidence is in [structural prototype comparison](composition-evaluation.md), [independent integrated evaluation](full-evaluation.md) and [loading measurements](loading-performance.md).

See [architecture inventory and defect map](architecture-inventory.md), [jj research](research.md), [mobile alternatives](mobile-concepts.md), [independent evaluation](evaluation.md), and [design system](design-system.md). See [navigation audit and final decisions](ux-audit.md), [workspace architecture](workspace-architecture.md), [command inventory](commands.md), [motion review](interaction-motion.md), and [validation](validation.md) for the integrated result. The final [accessibility and typography audit](accessibility-typography-audit.md) records measured contrast, actual browser zoom, enlarged text and remaining platform limits.

## Skill adaptation

The local frontend-design skill supplies deliberate product direction. The taste app-screen draw selected Data terminal (seed 1801153206), keeping existing palette and typography. Its thin selection marks, restrained surfaces and code/ID monospace fit a DAG inspector. Its stock mobile bottom bar, market chart rules and sample data requirements do not fit this brief: the required graph/sheet interaction and real repository data take precedence. Existing graph node/status shapes and accessible focus rings also take precedence over a one-pixel-only color rule.

The initial inspector report lives in `.taste-skill/studio/baseline/`: it flags tight outer insets, a disabled Files label and empty working-copy space. These are reviewed in the context of a dense tool, rather than treated as marketing-page defects.
