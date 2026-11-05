# Repository top bar

The identity reads `workspace@project` on one baseline. Workspace and project names remain separate menu controls with explicit accessible names. Non-default workspaces use the existing workspace-reference tint; the default workspace stays neutral.

Fetch, Push, Undo, Redo, Refresh and Commands remain visible. Narrow layouts replace text labels with named icons and wrap action groups instead of moving repository actions into overflow. Desktop chrome remains 40px tall. Preferences, native application commands and immutability override remain in More.

Redo stays visible when unavailable, with a disabled-state explanation. The backend preserves jj semantics: new operations after an undo can discard redo availability, including snapshots/imports that change repository state or concurrent operations. External CLI undo is verified on an isolated repository: refresh publishes redo availability, and the toolbar action restores the description. No backend undo semantics changed.

Remote and revset dropdowns share `SelectWidget`: native keyboard and selection behavior, a 16px Feather chevron, reserved trailing padding, themed picker where supported, and native WebKit fallback. The design-system dropdown examples use this production component.

Validation: 173 component/model tests pass. Workspace-inspector and panel-chrome suites pass; final targeted E2E checks pass for real external jj undo/redo, visible primary actions at 1024px/390px/320px, exact 40px desktop header height, and repository refresh/error behavior. Build, Svelte and Node type checks, formatting, Clippy and diff checks pass. Screenshots are in `.taste-skill/topbar-review/`.
