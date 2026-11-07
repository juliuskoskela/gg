# Display scale and history density

App zoom and history density solve different problems. Zoom makes the entire workspace readable on a high-density display; density controls the amount of repository information in each graph row.

## App zoom

The native app exposes Zoom In, Zoom Out and Actual Size in the repository overflow menu and the command palette. Ctrl/Command `+` (or `=`), `-` and `0` use the same commands, including while an editor has focus. Zoom ranges from 80% to 200%; 100% is the initial default. A successfully applied value is saved as `gg.ui.zoom` and restored in subsequent windows. Storage changes synchronize open windows. Failed native requests leave the last applied scale intact and show a recovery action.

Use the WebView's native zoom, rather than increasing only font sizes or applying CSS transforms. Text, graph coordinates, controls, responsive breakpoints and pointer hit targets then share the same coordinate system. The OS menu bar remains controlled by system settings. App zoom compounds with compositor scaling; screen resolution alone is insufficient evidence for choosing a default. Browser mode retains the browser's own zoom controls and shortcuts.

The controller serializes in-flight native calls and drops superseded queued requests. Preferences are written only after success. No repository state or layout dimensions are rewritten by zoom commands.

Implementation: `app/display/zoom.ts`, `DisplayZoom.svelte`, the shared command surfaces, and the narrowly scoped `core:webview:allow-set-webview-zoom` permission. See [Tauri WebView zoom](https://v2.tauri.app/reference/javascript/api/namespacewebview/#setzoom).

## History typography

Descriptions have medium weight; change IDs and empty descriptions remain quieter. The ID column fits its actual contents, including hidden-incarnation suffixes and divergence indicators, followed by an 8px gap. It does not reserve unused space for a fixed-width ID column.

## Timeline display

The Timeline toolbar's display menu (the eye) holds independent options in three groups: **Authors**; **Change IDs** and **Commit IDs**; **Bookmarks** and **Tags**. Change IDs, bookmarks and tags are on and commit IDs off by default. Commit IDs follow the change ID in muted code text. With both IDs hidden, descriptions start beside the graph. Hiding bookmarks or tags removes only those chips; working-copy markers stay. `gg.timeline.display` persists these choices (an earlier `gg.timeline.ids` is read once and completed with defaults); authors are the history density below. The options apply to the timeline graph only, so parent rows elsewhere keep their change IDs and references.

The menu is a menu of checkbox items: it opens below its button from the toolbar's trailing edge, takes focus when opened, moves with arrow keys, and closes with Escape or a click elsewhere. It is placed against the window, so a toolbar that scrolls sideways can't clip it.

## History density

The display menu's Authors option switches between Compact (28px on fine pointers; at least 44px on coarse pointers) and Tall (48px). Tall follows the type system: a 20px title line on the body role, a 2px gap and an 18px muted author line on the label role, with 4px above and below, and the node centred on the title line. `gg.history-density` persists the choice. Switching scales the graph scroll offset by the row-height ratio to preserve the top revision and fractional offset. Virtualization, selection paging, node centers, connecting edges and drag/drop regions all receive the same row height.

Compact rows retain at least 3px above and below 22px reference chips, 6px between chips, and 8px between description text and references.

On timeline containers below 400px, reference chips use compact icons to yield space to descriptions while keeping bookmark selection and commands reachable. Full names remain in tooltips, accessible labels and revision details.

## Native shell

Linux and Windows use the in-app repository menu and command palette instead of a second native menu row. Repository open, initialization, cloning, reopening and window closure remain reachable. Revision commands stay contextual. macOS retains its system App/Edit/Window integration. Frontend-only changes are excluded from the Rust watcher because Vite already reloads them; backend and Tauri configuration edits still restart the app.

## Validation

Observed in the Linux GTK/WebKit native app on a 3840×2160 monitor at 100% compositor scale: application zoom at 150%, matching 1.5 WebView device scale, working Ctrl-minus/Ctrl-equals, persisted 150% after reload, and no document overflow. Native screenshots are retained locally under `.taste-skill/studio/scaling/`.

Controller tests cover malformed preferences, unavailable storage, bounds, in-flight updates, failed apply/recovery, native command availability and shortcut matching. Windows, macOS, mixed-DPI monitor transitions and physical screen-reader use require platform follow-up; Linux observations do not establish those results.

## Appearance

The top-right repository actions menu offers a Light/Dark toggle. Its label names the current appearance and the action it will perform. A valid `gg.ui.theme` preference takes priority over repository `theme_override`, then the system color scheme. The same effective theme drives the shell and syntax-highlighted diff. Storage failure keeps the choice in memory; storage events synchronize other windows. Changing appearance does not write repository configuration.

## Whole-file diff context

The diff tools offer **Show whole file** beside layout and wrapping (inside the tools popover on narrow readers). It keeps additions and deletions highlighted while showing unchanged lines through the beginning and end of the file. The preference persists as `gg.diff-full-context`; compact, three-line context remains the default.

Full context is fetched only for the selected file, against the same exact revision set as the compact diff. Cache keys distinguish both modes, and stale responses cannot replace a newer selection. The renderer marks data complete only after that query resolves, avoiding partial-patch hydration errors. Binary files keep their existing unsupported-text notice; conflicts keep their marker view.

Hunk commands always use the original compact hunks. Expanding the reading context must not merge or otherwise change the operands offered by partial-file operations. This display toggle is independent of the experimental Neovim File mode and does not make the diff editable.
