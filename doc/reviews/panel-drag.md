# Panel dragging

Panel tabs use the MIT-licensed `@neodrag/svelte` pointer action with a six-pixel pickup threshold. The source tab stays in place while a lightweight label follows the pointer. A shared overlay uses Svelte transitions and the existing theme tokens; reduced-motion preferences disable its animation.

The center of a panel groups tabs. The outer quarter of its body splits the panel at the nearest edge. Hovering a tab inserts before it; the end of a tab strip appends. Pulling the active or inactive tab out of its own group works on all four edges. The shaded preview derives its bounds from the prospective dock tree, including collapse of the source's old region, without changing the layout before release.

Space picks up a focused tab. Tab/Shift+Tab selects another group, arrows choose an edge, and Enter drops. Escape cancels. Pointer cancellation, loss of window focus and leaving the source during keyboard movement also cancel. The live region announces destinations and completion. Normal arrow-key tab selection remains available outside a move.

Playwright exercises real mouse movement for grouping, detachment, reordering, outside drops and cancellation, plus keyboard docking, interrupted-drag recovery and reload persistence. Preview bounds are compared against final panel bounds. Pure model tests cover active and inactive self-group detachment on every edge and preserve each panel exactly once.

Screenshots: `.taste-skill/panel-drag/dark-landing.png` and `light-landing.png`.

Validation: 168 component/model tests, all 9 pointer-docking E2E tests and all 20 workspace-inspector E2E tests pass. Frontend build and type checks pass with no Svelte diagnostics. `cargo fmt --check`, `cargo clippy` and `git diff --check` pass. Chromium screenshots confirm the shared dark/light palette; native Tauri receives the same source through the existing watch server.
