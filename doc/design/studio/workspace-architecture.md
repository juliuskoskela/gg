# Workspace state and view boundaries

The graph remains the repository workspace's stable surface. The selected revision is queried by `Shell`, while the workspace controller owns only presentation and the identity needed for navigation. It does not fetch data. Explicit graph selection opens the inspector at half height; background selection reconciliation updates its exact commit/change identity and valid file without reopening it. Closing clears inspector context, not the external graph selection. A repository change clears inspector state.

The controller exposes `closed`, `collapsed`, `half`, and `full` presentations. Full inspection records the prior collapsed/half state and adds one browser history entry using `/?inspect=<commit>&file=<path>`, with `inspectFrom=<commit>` for a range. Changing the file replaces that entry. Back returns to the previous shelf without reloading the graph; a deep link starts full and can return to half. `start()` installs the history listener and returns its cleanup function. The shell must start it on mount and supply the parsed inspection revset to its existing selection query; on successful, current results it may call `reconcileSelection` with available paths. The graph component and scroll host must remain mounted throughout presentation changes.

The desktop graph fraction is a clamped local preference; panel visibility and diff preferences use the existing persisted presentation stores. The controller does not persist temporary overlays. `workspaceViews` describes scope, default placement, compact presentation and availability. Registering an entry does not create a permanent navigation item. Current operation demonstrates a repository-scoped view: bounded desktop tabs beside the graph, a routed compact destination, status and authoritative pre-snapshot Undo/Redo eligibility. It is not a fabricated operation-history browser. Revision modules remain the content extension point for tools within a revision.

The integrated compact surface uses `InspectorSheet` for the half/collapsed preview and `RevisionPane` for full inspection. Its visible controls support collapse, expansion, and returning to the graph; Escape follows the same hierarchy, with file browsing dismissed first. Full inspection offers Files and Details sections and a changed-file picker. The graph remains mounted under the full view and is visible beside the compact preview. Desktop panel controls and keyboard/pointer resizing remain in place.

`CommandPalette` exposes repository and revision commands and picker-placed registry views. The current operation is opened from this picker and displays the current status description. Command availability comes from live selection, repository status, and mutation state; the palette does not add permanent rail entries. Navigation and history remain presentation concerns: only full inspection adds an inspection URL, while the graph's revset and paging continue to be owned by `LogPane`.

## Vocabulary and ownership

| Concept | Contract in this iteration |
| --- | --- |
| View | A repository/revision capability with stable registry identity, availability and rendering entry. It does not own its container or necessarily get a navigation button. |
| Panel | A persistent region hosting a view. Desktop graph and revision panels support visibility and graph-width resizing. Arbitrary docking is deliberately not implemented. |
| Tab | A named slot in the bounded desktop repository-tool host (maximum three). Files/Details are sections of the revision view. Tab switching does not grow browser history. |
| Inspector | The selected revision context, precise commit/range and active file, shared by preview and full inspection. |
| Sheet | A transient compact presentation of the inspector. Half/peek are local states; graph taps do not push history. It is nonmodal so the graph remains usable. |
| Dialog | A modal task or command palette requiring explicit completion/dismissal. Repository views use the adaptive host, not a dialog. Native dialogs own focus isolation; repository input dialogs retain the existing shell modal contract. |
| Command | An operation with stable identity, current availability and one execution handler. Commands may be presented in several surfaces; opening a view is itself a command. |

Domain queries and repository events belong to Shell/IPC. Graph range selection belongs to `revisionSelectEvent`; the controller stores the exact resolved selection needed by inspection navigation. `workspaceController` owns sheet/full history and graph fraction. Existing persisted desktop pane visibility, file-tree visibility and diff preferences remain presentation adapters in `stores.ts`; they never choose a revision or execute a command. `RevisionPane` owns Files/Details section and the file navigator. Per-file reading positions live outside rendered diff instances, keyed by session repository scope, precise commit/range, path and diff layout. Drafts remain in the existing draft store.

Full inspection and opening a compact repository-tool destination each own one meaningful browser entry. Sibling tools replace the same entry. Its exact commit and optional range endpoint survive refresh; file changes replace that entry. Missing revisions show a recovery state. Rewrites update exact IDs after a current query; ambiguous change identities are not silently replaced by another graph row. Repository switching clears inspection. Graph URLs do not restore a previous temporary sheet. Moving across 880px changes presentation without destroying the graph or resetting selection; Full remains a deliberate route at every width.

Handle gestures never begin on preview/diff content. Escape first closes a dialog/menu or file navigator, then returns Full to its previous sheet, then collapses Half. The explicit Back button uses the same file-navigator-first rule. Browser Back exits the Full route; opening a file picker does not add a separate entry. After file selection, focus moves to the diff reader; cancelling file navigation restores its trigger. Keyboard graph navigation does not move focus into the sheet.

## Working extension example

`OperationView.svelte` is a working registered view displaying the real current operation. Its `workspaceViews` entry supplies a component and availability predicate. Commands automatically contributes picker-placed views, and `WorkspaceTools` renders the registered component with repository status. Adding another repository tool uses the same two entries (component and definition), without editing mobile navigation or a rail. No backend operation-log API or fictitious history was added.

A future operation-history browser can start in that tool host and supply its own queries. The existing `?view=<id>` route identifies a compact tool. `validateState`, `initialState` and `onViewStateChange` provide small validated presentation persistence. Do not encode operations as revision routes. Inspector-specific modules continue using the existing `revisionModules` content registry. This is intentionally a small extension boundary, not an arbitrary plugin/docking framework.

When an active desktop description editor crosses into compact layout, the controller opens Full and retains editor focus and draft. Equivalent query results update existing components instead of remounting them, so refreshed repository status does not needlessly close contextual controls.

On desktop, the changed-files panel has its own persisted pixel width and a focusable splitter. Pointer dragging or Left/Right changes the width; Home and End reach its bounds. The available width is clamped to keep at least 280px for revision content, and temporarily narrowing the workspace does not overwrite the saved preference. Compact file browsing remains an overlay without a splitter.

## Integrated data and identity contracts

`query_revision_summary` returns exact range, headers, parents, file metadata and conflict paths without materializing every diff. `query_revision_diff` loads one selected path; preview and Full share a bounded 24-entry promise cache keyed by session repository, exact endpoints and path. Errors are retryable, and request generations reject obsolete responses. Legacy `query_revisions` remains available for native/backward-compatible callers. Both new queries are registered in both transports.

After a repository mutation, `resolve_revision_selection` checks the entire repository. An exact current commit remains selected; a unique rewritten incarnation follows its logical change. Multiple current incarnations produce an explicit choice. A filtered graph never proves uniqueness. Exact hidden commits remain inspectable. Undo/Redo preserve inspected context instead of accepting the backend's generic working-copy recommendation. A bounded exact-selection file history restores a removed active file when Undo restores that commit.

A requested missing URL file displays a recovery message; it is not silently substituted. Ordinary selection changes retain a valid path, otherwise reset it. Vertical and horizontal reading state use exact versions. Description drafts use exact endpoints and transfer only after authoritative unambiguous rewrite resolution, preventing divergent incarnations from sharing text accidentally.

Repository scopes are session identities attached to each opened configuration, not merely directory names. Reopening even the same path invalidates old requests and command operands. Layout preferences persist independently; domain selection and drafts are not restored across app sessions. This is deliberately conservative when a repository directory has been replaced.

Commands capture repository status, configuration, operands and selection before asking for a destination/input, then revalidate before executing. Backend preconditions remain authoritative. Workspace identity comes from `query_workspace_identity`, because a revision's `working_copy_of` refers to other workspaces. Native context-menu dispatch and web menus execute the same registry commands.
