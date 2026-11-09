# Workspace terminal

Open **Views → Terminal**, or find **Terminal** in the command palette. The
terminal starts the user's `$SHELL` (`COMSPEC` on Windows, falling back to
`/bin/sh` or `cmd.exe`) in the loaded workspace's working directory. It edits
the working copy, independently of the revision being inspected.

Bash, Zsh and Fish use a plain monospace `@` prompt, matching jj’s working-copy
notation. GG loads the shell's normal configuration first, then applies its prompt
for this session only. Your shell configuration files are not modified. The
toolbar shows the starting folder name; its tooltip keeps the full path.

The view supports the same tabs, splits, resizing and compact layout as the
other workspace views. Its shell, terminal state and scrollback survive tab
switching and moving the panel. Closing the view, changing workspace, reloading
the application, or closing its window ends the session. **Restart shell** ends
the current shell and starts a fresh one; after exit or a connection failure,
**New shell** starts again. Sessions are not restored after reload.

Terminal input stays in the terminal, including Ctrl+C and Ctrl+Z. Press
**Ctrl+Shift+F6** to move focus back to its toolbar. Ghostty handles selection,
copy, paste, terminal escape sequences and application input modes. A text copy
of the visible terminal screen is available to assistive technology; continuous
output is not announced automatically.

Output and input schedule a repository refresh at most once per second. This
uses GG's existing snapshot flow, so commands that change files or run `jj`
update the timeline without changing the selected revision intentionally.

## Implementation

- `app/terminal/`: Ghostty renderer, session lifetime, transport and theme
  adapter. `ghostty-web` is pinned to `0.4.0-next.21.g640db46` and loaded only
  when a terminal opens. This prerelease includes upstream input and reflow fixes.
  It ships Ghostty's VT engine compiled to WebAssembly. This uses its browser
  canvas renderer, not a native GPU terminal surface.
- `src/terminal.rs`: a real `portable-pty` PTY, shared by both transports.
  A blocking reader and writer run outside the UI and async runtimes. Input
  and output queues are bounded; terminal size and message size are limited.
- Desktop: Tauri commands and a channel, with opaque session IDs scoped to
  their owning window. Window destruction also closes all of its PTYs.
- Web: `/api/terminal`, a binary WebSocket for PTY bytes and JSON for resize and
  lifecycle messages. A random per-server token is injected into the served
  HTML. The handshake requires the token, a loopback Host and an exactly
  matching HTTP Origin. The backend chooses the current workspace directory;
  a stale or arbitrary directory is rejected. Closing the socket drops the PTY.
  There are at most eight web sessions and four sessions per desktop window.

For web development, open the URL printed by `gg web`, which supplies the token,
rather than the Vite origin. The web terminal is intended for local use; its
handshake intentionally rejects remote hostnames and proxy origins.

## Appearance

The terminal uses GG's code font and the active family, light level and
colour-vision palette. Its sixteen ANSI colours resolve semantic tokens through
the browser before passing sRGB values to Ghostty. Bright variants retain the
same semantic hue, preserving the palette's existing distinctions. Programs
that request explicit 256-colour or true-colour output generally control those
colours themselves; GG does not claim contrast guarantees for them.

Ghostty’s current browser API exposes resolved cell colours, and its runtime
theme setter does not update them. `appearance.ts` adapts the renderer’s public
API to remap the original ANSI and default colours when the theme changes. This
preserves both the parser’s history and the running process. An explicit RGB
colour exactly matching one of those original colours is also remapped because
the API cannot distinguish its origin. Remove this adapter when upstream exposes
dynamic palette updates.

## Validation

- PTY tests cover workspace cwd, sizing, input, exit status and teardown.
- Web authorization tests cover missing/invalid tokens and missing/cross origins.
- Browser tests cover a real shell, Unicode, file changes and snapshot refresh,
  tab and dock movement, restarting, reopening, responsive sizing and light/dark
  colour-vision rendering.
- Existing component tests, frontend type/build checks, Rust formatting/clippy
  and the Nix npm/Cargo dependency fetches are checked alongside the feature.

Sources: [ghostty-web](https://github.com/coder/ghostty-web) and
[portable-pty](https://docs.rs/portable-pty/0.9.0/portable_pty/).
