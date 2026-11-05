# Display scale and history density

App zoom and history density solve different problems. Zoom makes the entire workspace readable on a high-density display; density controls the amount of repository information in each graph row.

## App zoom

The native app exposes Zoom In, Zoom Out and Actual Size in the repository overflow menu and the command palette. Ctrl/Command `+` (or `=`), `-` and `0` use the same commands, including while an editor has focus. Zoom ranges from 80% to 200%; 100% is the initial default. A successfully applied value is saved as `gg.ui.zoom` and restored in subsequent windows. Storage changes synchronize open windows. Failed native requests leave the last applied scale intact and show a recovery action.

Use the WebView's native zoom, rather than increasing only font sizes or applying CSS transforms. Text, graph coordinates, controls, responsive breakpoints and pointer hit targets then share the same coordinate system. The OS menu bar remains controlled by system settings. App zoom compounds with compositor scaling; screen resolution alone is insufficient evidence for choosing a default. Browser mode retains the browser's own zoom controls and shortcuts.

The controller serializes in-flight native calls and drops superseded queued requests. Preferences are written only after success. No repository state or layout dimensions are rewritten by zoom commands.

Implementation: `app/display/zoom.ts`, `DisplayZoom.svelte`, the shared command surfaces, and the narrowly scoped `core:webview:allow-set-webview-zoom` permission. See [Tauri WebView zoom](https://v2.tauri.app/reference/javascript/api/namespacewebview/#setzoom).

## History typography

Descriptions have medium weight; change IDs and empty descriptions remain quieter. The ID column fits its actual contents, including hidden-incarnation suffixes and divergence indicators, followed by an 8px gap. It does not reserve unused space for a fixed-width ID column.

## History density

The labelled History density selector offers Compact (32px on fine pointers; at least 44px on coarse pointers) and Tall (60px). Tall places a regular-weight, muted author below the description, with change ID and title aligned on the first line. `gg.history-density` persists the choice. Switching scales the graph scroll offset by the row-height ratio to preserve the top revision and fractional offset. Virtualization, selection paging, node centers, connecting edges and drag/drop regions all receive the same row height.

On timeline containers below 400px, reference chips use compact icons to yield space to descriptions while keeping bookmark selection and commands reachable. Full names remain in tooltips, accessible labels and revision details.

## Native shell

Linux and Windows use the in-app repository menu and command palette instead of a second native menu row. Repository open, initialization, cloning, reopening and window closure remain reachable. Revision commands stay contextual. macOS retains its system App/Edit/Window integration. Frontend-only changes are excluded from the Rust watcher because Vite already reloads them; backend and Tauri configuration edits still restart the app.

## Validation

Observed in the Linux GTK/WebKit native app on a 3840×2160 monitor at 100% compositor scale: application zoom at 150%, matching 1.5 WebView device scale, working Ctrl-minus/Ctrl-equals, persisted 150% after reload, and no document overflow. Native screenshots are retained locally under `.taste-skill/studio/scaling/`.

Controller tests cover malformed preferences, unavailable storage, bounds, in-flight updates, failed apply/recovery, native command availability and shortcut matching. Windows, macOS, mixed-DPI monitor transitions and physical screen-reader use require platform follow-up; Linux observations do not establish those results.

## Appearance

The top-right repository actions menu offers a Light/Dark toggle. Its label names the current appearance and the action it will perform. A valid `gg.ui.theme` preference takes priority over repository `theme_override`, then the system color scheme. The same effective theme drives the shell and syntax-highlighted diff. Storage failure keeps the choice in memory; storage events synchronize other windows. Changing appearance does not write repository configuration.
