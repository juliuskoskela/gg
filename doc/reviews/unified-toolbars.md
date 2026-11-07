# Shared view toolbars

A view has two fixed rows above its scrolling content. The title line contains the active title or tab strip, tab close controls and a toolbar disclosure. The second row contains that view’s controls, led by any summary such as the Timeline’s revision count. Views without controls have neither an empty row nor a disclosure. The disclosure uses a sliders icon, meaning view controls; a hamburger would suggest navigation.

The complete header block leaves an 8px gap before the view content, using `--panel-content-gap`. This spacing belongs to the shared header so it stays consistent with single titles, tab strips and hidden toolbars, without changing a virtualized view’s row or graph coordinates.

Both rows are one header block on the same quiet surface, closed off from the content by a single 8% ink hairline; there is no rule between title and toolbar. A lone title has no fill, because fill means chosen among siblings. Titles, toolbar controls and content share the panel inset, and hover pills overhang into the gutter. Buttons remain transparent at rest. Segmented choices and independent toggles are frameless: segments sit 2px apart, transparent at rest in the secondary ink, and the chosen one carries a pill of the theme's ink with full-strength icon. An outline around transparent segments read as a dark well next to the lit one. Toolbar feedback mixes ink into the actual toolbar surface: hover 6%, selected 15%, selected hover 19%, pressed 23%, so hovering never looks like choosing. Segments, fields and action buttons share 28px desktop controls, with 44px targets on narrow screens and coarse pointers. Groups use 12px separation; related actions use 8px. Selected labels stay strong; inactive icons remain readable.

Controls do not wrap into an extra title row. An overflowing toolbar scrolls horizontally, independently from tabs and content. Keyboard focus reveals only the toolbar’s scroll area. Normal Tab order is retained for mixed buttons, fields and segmented groups; the container uses an accessible group rather than an ARIA toolbar with an incomplete arrow-key model. Hiding a toolbar removes it from navigation while retaining its component state. The visibility choice belongs to the view, surviving tab changes, docking and responsive remounts for the current window session.

## Contribution contract

`PanelGroup` supplies an isolated toolbar registry for each dock group. `PanelBody` identifies its view using `provideToolbarOwner(id)`. Built-ins and extensions contribute stateful controls from inside their own component:

```svelte
<ViewToolbar label="My extension tools">
    <ActionWidget safe onClick={importDocument}>Import</ActionWidget>
    <ToggleTray label="Display"><ToggleItem label="Wrap lines" icon="corner-down-left" on={wrap} onClick={() => wrap = !wrap} /></ToggleTray>
</ViewToolbar>
```

The snippet keeps its original reactive state and handlers. `PanelTabs` renders only the active view’s contribution into `ToolbarRow`; it needs no extension imports or command-specific conditionals. Unmounting a contributor removes its own entry without erasing a replacement. Each view contributes one global toolbar; compose related groups inside it. Contextual controls for a specific hunk, file or discussion remain beside that content rather than crowding the global toolbar.

Outside a dock owner, the same component renders a local `ToolbarRow`. `local={true}` explicitly requests that mode for overlays or expanded plugin surfaces. It withdraws the dock contribution while local, preventing duplicate controls. Standalone chrome examples can pass a `tools` snippet directly to `PanelTabs`.

Timeline density, Diff display, Files filtering, and History/Evolution refresh use this contract. Review’s library, new/import/export and expansion controls are integrated separately on its unmerged candidate branch.

## Validation

Component coverage exercises independent tab close/keyboard selection, toolbar disclosure, stateful extension actions, per-view visibility and unregistering a disabled extension. Browser coverage checks single/stacked/split layouts at 1440, 768, 390 and 320px, horizontal overflow, focused control visibility, responsive remounts, retained file filters and panel dragging. Theme coverage measures all nine family/depth variants using the rendered controls and text.
