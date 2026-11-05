# Workspace architecture inventory

Discovery snapshot; this describes the current implementation and a proposed direction, not an implemented redesign.

## Current system

- `App.svelte` chooses default, `/log`, or `/revision` from `route.ts`. The default mounts `LogPane` and a queried `RevisionPane` in a resizable grid. The 4px separator supports pointer capture and Left/Right/Home/End; graph width is clamped to 240px and reserves 480px for detail. Width is component-local and resets on remount. Below 880px of workspace width the layout switches to one visible pane; `display: none` hides the graph while detail is open, although its component remains mounted.
- `Shell.svelte` owns workspace initialization, selection query, stale-request protection, status refresh, native selection synchronization, menus, modal and error/progress surfaces. `stores.ts` contains backend event stores, transient interaction stores and local preferences together. `ipc.ts` abstracts Tauri versus web queries/mutations/triggers and events; presentation changes should not bypass it or duplicate selection queries.
- `WorkspaceChrome` provides repository navigation, toolbar and content. At viewport width 768px it changes between a persistent 56/224px rail and a drawer. Navigation exposes working copy, History, Bookmarks, Conflicts and saved revsets; choosing one changes the graph query. The top bar and controls switch to larger targets at 600px/coarse pointer. Workspace compactness is measured independently of viewport, so rail, pane and file breakpoints can disagree.
- `LogPane` owns the revset input/presets, paging, graph augmentation, selection anchor and graph scroll. It queries `query_log` and subsequent pages and reconciles selection by commit, then change ID after rewrites. `GraphLog` virtualizes by scroll position and fixed row height; recycled rows are keyed by slot index, with separate graph-line rendering. Preserve the same scroll container and mounted graph across presentation changes.
- `RevisionPane` builds combined changed/conflicted files, owns current module and path, and uses `revisionModules` (currently just Changes). At viewport width under 768px files become an overlay; desktop has a 200px files column. `RevisionChanges` restores selected path and diff scroll from an in-memory map keyed by workspace and change identity. `DiffViewer` uses `@pierre/diffs`, resolves auto layout at 720px of available width, and persists split/unified and wrapping preferences.
- `WorkspacePanelControls` maps History/Revision toggles to `paneMode` on desktop and `mobileRevisionPane` on compact layouts. Graph selection and working-copy selection also set the mobile boolean. `RevisionFiles` has its own Escape handling; drawers, menus, dialogs and description editor have independent dismissal and focus rules. `ListWidget` owns keyboard list movement and scrolling. `Shell` forwards native accelerators; context menus invoke the same mutation policies used by object interactions.
- Persistence: localStorage holds pane mode, files/overview visibility, diff style/wrap and navigation expansion; revision review position and description drafts are memory-only. Revsets/presets are repository config. Web routes are parsed once, and UI filters/selection/panels do not update browser history or URL.
- Coverage includes Vitest component/unit tests (`LogPane`, `RevisionPane`, `DiffViewer`, `ListWidget`, toolbar, context menu and mutation actions) and Playwright flows under `e2e/`, including `gg-plus.test.ts`. Add behavior-level coverage for mobile sheet transitions, scroll preservation and focus/back order, plus desktop resizing; do not rely on snapshots alone.

## Defect map and constraints

1. Compact selection replaces the graph with an opaque detail pane; the user loses spatial context even though the graph remains mounted. Returning changes focus, and visibility toggling can disturb measured list dimensions and scroll.
2. Three independent width decisions (880 workspace, 768 viewport, 720 diff container) plus 600px touch styling produce transitional combinations that are hard to reason about. A narrow desktop pane can receive desktop file navigation while the workspace is compact.
3. A boolean mobile detail state cannot express peek, half, full, or a nested files surface. Several independent Escape handlers can close multiple layers or restore focus to the wrong control.
4. Repository navigation's fixed entries are revset shortcuts, while revision modules are registered separately. Adding every future capability to the permanent rail will multiply navigation without a clear scope distinction.
5. Preferences, selection, query, and temporary presentation are intermingled in stores. Persisting a desktop pane mode can force an unexpected compact transition; scroll and selection have different lifetimes.
6. Web URL state is static after startup. A browser Back action has no explicit relationship to an open detail or files surface; any history integration needs to coexist with existing `/log` and `/revision` entry routes.

The upstream [Vercel web-design-guidelines skill](https://raw.githubusercontent.com/vercel-labs/agent-skills/main/skills/web-design-guidelines/SKILL.md) and its [current rules](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md) were read for this inventory. Relevant checks include keyboard alternatives to gestures, focus visibility and restoration, contained sheet scrolling, safe areas, reduced motion, URL state, accessible names and virtualization. These are design constraints, not a claim of a complete compliance audit.

## Architecture options

| Direction | Strength | Cost / fit |
| --- | --- | --- |
| Graph-first workspace | Keeps revision topology and selection in view; maps directly to existing split and mobile sheet. | Best smallest change; future non-graph views need a registry and explicit scope. |
| Adaptive docking | Flexible multiple panels and positions. | Large layout/state and accessibility surface; unjustified for current two-pane workflow. |
| Command-centered | Fast discovery for infrequent actions and views. | Complements navigation but cannot replace visible graph, selection, or touch workflows. |

Recommend graph-first with adaptive presentation and a future command entry point. Preserve desktop split/resizing and the existing selection/query pipeline. Introduce docking only if actual tasks demand multiple independent panels.

## Proposed model and vocabulary

- **Domain**: repository configuration/status, revisions, files, mutations and backend events. `Shell`/IPC remain authoritative; no duplicate backend model.
- **Selection**: revision range (`RevSet`) and selected file. Selection survives a panel or sheet closing; repository changes reconcile identities through existing `LogPane` logic.
- **Navigation**: current repository view/revset and optional revision view, plus a small ordered stack for temporary surfaces. A navigation action chooses what is being viewed; it does not itself dictate a viewport layout.
- **Presentation**: desktop panel visibility and split width; compact sheet state `closed | peek | half | full` and nested files surface. Derived compactness chooses a presentation, not a new selection. Each transition has one owner and one dismissal order.
- **Persistence**: persist deliberate stable preferences (split width, panel visibility, diff options) separately from transient sheet state. Keep review path/scroll keyed by repository and change identity; avoid serializing open overlays. On web, define history entries for meaningful navigation only, with Back unwinding the top temporary surface first; retain existing deep links.

A **View** is a named content experience and its context (repository graph or revision changes). A **Panel** is a desktop region hosting a view; a **Tab** selects peer views within one context, not a global destination. An **Inspector** shows information about the current selection, here revision detail. A **Sheet** is its compact overlay presentation, with non-gesture controls. A **Dialog** is a blocking decision or input with modal focus behavior. A **Command** is an invocable action with availability and optional shortcut, independent of where it is displayed.

## Interaction contract

On desktop retain graph and inspector side by side, adjustable by pointer and keyboard; preserve the current panel-only modes. On compact widths the graph remains mounted and visible. Tapping a revision selects it and opens an approximately half-height inspector sheet; explicit controls expand to full, collapse to a small peek, or close. A peek retains the selection and leaves useful graph space. Back/Escape closes the topmost nested surface first (files, then full to half, then peek/closed as chosen by the final interaction design), with a visible close/back control and no gesture-only operation. Reopening the same selection keeps diff path and scroll; graph scroll remains stable through all sheet transitions. Account for safe-area insets, keyboard focus, reduced motion and constrained viewport height. Do not force focus into a nonmodal peek; full/modal presentation must manage focus and restore it on dismissal.

Integration sequence: isolate sheet/panel state in a workspace presentation controller; connect existing selection actions to a single `openSelection` transition; replace compact `display: none` graph switching in `App.svelte` with an overlay; adapt `WorkspacePanelControls` and file overlay to the shared dismissal order. Keep `LogPane` component identity, scroll host and `GraphLog` slot keys intact. Drive compactness from one workspace boundary and let internal diff layout remain container-responsive.

## Future registry example

A small registry can describe `{ id: "changes", scope: "revision", label: "Changes", component, available }` (the existing `revisionModules` shape) and later `{ id: "operations", scope: "repository", label: "Operations", component, available }`. The shell selects a view by ID and context; a view picker or command search can expose infrequent entries. Only deliberately pinned, high-frequency destinations occupy permanent navigation. Registering a view should not create an additional rail item, duplicate selection, or change IPC ownership.
