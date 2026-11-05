# Developing this fork

This fork is evolving GG's interface toward a modern desktop experience. The
existing Tauri 2, Svelte 5 and TypeScript stack is the starting point; the Rust
worker, repository operations and IPC remain available while the UI changes.

## First run

```sh
nix develop
just setup
just dev
```

`just setup` installs dependencies and builds the initial frontend assets needed by
Cargo checks and tests, even when subsequent development uses the Vite server.

`just dev` opens the native Tauri app on the current repository. Vite serves the
frontend at <http://localhost:6973>; component edits under `app/` automatically
reload the native window. Tauri watches the Rust backend and rebuilds it when it
changes. The first Rust build takes longer. Keep this command running while iterating.

The flake pins Rust, Node 24, Jujutsu, formatting tools and native dependencies
(including GTK/WebKitGTK on Linux). Its modules follow the `flake-parts` layout
used in Cortex. Linux on x86-64 and ARM64, and Apple Silicon macOS, have outputs;
each platform should be built on a matching host. A graphical session is needed
to open the native window. On macOS, install Xcode command line tools first.

If you use direnv with nix-direnv, run `direnv allow` to load `.envrc`
automatically. Otherwise, enter `nix develop` in each terminal.

## Browser iteration

Run these in two terminals inside the development shell:

```sh
# terminal 1: build initial embedded assets, then watch the Rust server
npm run build
just dev-backend

# terminal 2: open the live Svelte frontend
just dev-frontend
```

Open <http://localhost:6973>. Vite proxies `/api` (including server-sent events)
to the real GG backend at `127.0.0.1:6974`. Frontend edits reload without
rebuilding Rust. `dev-backend` automatically rebuilds on backend changes and
keeps the process in the foreground so stopping the watcher stops the server.
Ports 6973 and 6974 must be available. Use the Tauri loop when working on native
menus, dialogs or windows.

Svelte component changes reload the complete page. Standalone CSS files still
update live.
The watcher waits briefly for file writes to settle. This matters when GG opens
its own source repository: Edit and Undo can replace several components and
their shared exports together. Preserving old component instances through that
checkout can mix revisions and break the layout. A page reload always mounts a
coherent frontend. Repository operations that leave frontend files unchanged do
not reload the page.

To inspect GG's own history with a fixed frontend version, use the backend's
embedded UI at <http://localhost:6974> after building it, or run `cargo run -- web`
with prebuilt assets. That frontend stays fixed when the inspected source changes.
Another option is `npm run build` followed by `npx vite preview --port 6976` while
the backend is running. That preview serves the built frontend and uses the same
API proxy, without watching checked-out source files.

## Build and checks

```sh
just build                  # local native binary in target/release/gg
nix build                   # sandboxed build; binary at result/bin/gg
nix run -- gui .            # build and launch this fork
just check                  # Svelte/TypeScript, Clippy and Rust formatting
just fmt                    # Rust and Nix formatting
```

`just test` runs the backend and frontend suites. Frontend browser tests also
need Playwright's Chromium and its native libraries; follow Playwright's setup
for your host before running them. To use an installed Chromium or Chrome instead,
set `GG_TEST_BROWSER` to its executable path for `npm test` (both the component
and end-to-end suites use it). This is separate from the app's native webview.

Both `Cargo.lock` and `package-lock.json` are committed. If dependencies change,
update the corresponding `cargoHash` or npm dependency hash in `nix/package.nix`
(temporarily use `lib.fakeHash`, build, then copy the reported actual hash).
`nix flake update` explicitly updates the pinned Nix tools. Run `cargo gen` after
changing the exported message types in `src/messages/`.

## Jujutsu and Git

This checkout has a local `.jj/` colocated with Git. Fresh checkouts can opt in:

```sh
jj git init --colocate
jj status
jj log -r '@ | @-'
```

`.jj/` is local metadata and is ignored by Git, Vite and the backend watcher.
Git worktrees each need their own Jujutsu initialization. Use `jj` for inspecting
and recording changes, with bookmarks for branch names. Jujutsu commands can
detach Git HEAD during normal operation; when handing work back to Git tooling,
attach the intended named branch and verify it owns the expected commit.

## Where to iterate

- `app/App.svelte`, `app/global.css`: application layout and shared visual styles.
- `app/GraphLog.svelte`: virtualized repository graph.
- `app/ipc.ts`, `app/events.ts`: transport and backend event stores.
- `src/worker/`: repository operations shared by desktop and web modes.
- `Tauri.toml`, `vite.config.ts`: native window development and frontend serving.

Keep virtualized list props reactive, and key rows by slot index. See `AGENTS.md`
for the repository's implementation conventions.

## Workspace layout and diffs

GG+ gives the diff the main canvas, with a narrow timeline beside it. The shared
panel buttons show or hide navigation, timeline, diff, file tree and revision
details. Navigation starts as a slim icon rail, with its expand/collapse button at the
bottom. Repository views work directly from the rail. On mobile those views
become bottom navigation, with More opening saved revsets and remote details.
Revision details start
collapsed. Revision details open
in a trailing panel, or a drawer when the diff pane is too narrow.
Pane visibility, file tree, diff layout, wrapping and revision metadata visibility
are saved locally. Hidden panes stay mounted to preserve drafts and graph position.

The change pane uses `@pierre/diffs` through its framework-independent API. It
provides syntax highlighting, line numbers, inline word changes, split/stacked
layouts and line selection. The optional file browser groups **changed files** by
repository directory; the file selector also works with the tree hidden. Existing
file and hunk drag actions remain available, with hunk handles under Hunk actions.

Diffs use the hunks supplied by GG. Skipped context cannot yet be expanded into
complete file contents. Conflict markers are shown as code, with resolution kept
in the configured external merge tool. Binary/submodule placeholders come from
the existing backend. Highlighting grammars and themes are bundled locally, so
diff viewing does not need a network connection.

Repository actions live in the floating toolbar at the top of the workspace.
Choose a remote, then Pull (fetch remote bookmarks), Push or Undo. The More menu
contains Refresh, Redo, the immutability override, operation details and the full
workspace path. Drag guidance appears only during drag operations; there is no
permanent footer. The toolbar wraps instead of hiding actions at narrow widths.

The layout follows `.agents/skills/better-layout/SKILL.md`: primary content leads,
related controls share a placement zone, secondary detail is disclosed, and
components adapt to their available width. Code and repository expressions keep
left-to-right direction when the surrounding interface is mirrored.

### Concurrent-operation test fixtures

The divergence acceptance fixture uses the `jj` CLI to construct concurrent operation branches. `nix develop` supplies it; CI installs `jj-cli` 0.46.0 to match the embedded dependency. This is a test prerequisite, not a requirement for GG users. The UI and backend tests operate on temporary repositories.
