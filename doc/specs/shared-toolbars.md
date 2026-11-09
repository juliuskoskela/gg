# Shared toolbar contract

Toolbar registration, presentation and layout remain separate. Feature views own their controls; a containing panel chooses where to display them. Moving a panel or changing its active tab does not require the feature to copy its controls into a header.

| Surface | Contract |
| --- | --- |
| `PanelGroup` | Provides an isolated registry for descendant views and panel frames. Nest groups to isolate repeated view IDs. |
| `provideToolbarOwner(id)` | Associates descendants with a stable view ID. Call during component initialization; recreate the owner when its ID changes. The ID matches `PanelTabs.items[].id`. |
| `ViewToolbar` | Accepts a required `children` snippet, optional accessible `label` (default `View tools`) and `local` (default false). Registers content with the nearest owner and group; renders `ToolbarRow` locally when either is absent or `local` is true. |
| `PanelTabs` | Renders active-owner contributions in registration order, in a single `ToolbarRow`. Its optional `tools` snippet is a fallback when no contribution exists; `toolsVisible` controls that fallback. The frame labels the row from the active view, owns collapse/expand and keeps it outside tab semantics and content scrolling. |
| `ToolbarRow` | Layout only: required accessible `label`, optional `id`, `hidden`, and child snippet. Keeps leading summaries (`.toolbar-lead`), trailing tools, overflow scrolling and focus visibility consistent. |

Independent core or plugin contributions may target the same owner. Each receives its own lifetime handle; updating, switching to local rendering or destroying one contribution cannot overwrite or remove its siblings. A local/hosted round trip retains the original registration order. Removing all contributions removes the frame's row and collapse button. Hidden hosted content remains mounted, so local control state survives collapse.

`createToolbarRegistry()` exposes a read-only Svelte subscription and `contribute(owner)`. A handle exposes `update(snippet | undefined)` and idempotent `dispose()`. Disposed handles cannot register again. Direct mutable access to the registry map is not supported. Use `ViewToolbar` for component contributions so teardown happens automatically.

Toolbar controls invoke existing feature commands and callbacks. The registry does not implement repository operations or assign permissions. Existing shared hidden-toolbar preferences remain keyed by view ID and survive layout remounts.

The **Toolbar contributions** section in `DesignSystem.svelte` shows two independent contributions sharing a panel row and the same controls in standalone mode. Registry tests cover ownership, order and disposal; component tests cover reactive controls, collapse, switching active views, local rendering and independent teardown.
