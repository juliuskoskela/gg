# Shared view toolbars

A view has two fixed rows above its scrolling content. The title line contains the active title or tab strip, tab close controls and a toolbar disclosure. The second row contains that view’s controls. Views without controls have neither an empty row nor a disclosure. A toolbar icon depicts the row it shows; a hamburger would suggest navigation.

Both rows use the same quiet header surface and 5% ink hairlines. Buttons remain transparent at rest. Toolbar feedback mixes ink into the actual toolbar surface: hover 8%, selected 13%, selected hover 18%, pressed 22%. Segments, fields and action buttons share 28px desktop controls, with 44px targets on narrow screens and coarse pointers. Groups use 12px separation; related actions use 8px. Selected labels stay strong; inactive icons remain readable.

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
