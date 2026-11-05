# Native launch validation

2026-11-05, Linux Wayland/Hyprland, existing `target/debug/gg`, isolated repository `/tmp/gg-native-studio-eu0300nn`. No source changes or builds performed in this check.

## Result

**Native shell and menu check passed; native frontend parity remains unverified.** The app mapped a `gg` Wayland window titled `GG+ — /tmp/gg-native-studio-eu0300nn`. Screenshot `launch.png` shows the native Repository / Revision / Edit menu bar but a blank light webview. Sending Alt+R to the explicitly identified app window opened the native Revision menu, showing New child, New inserted parent, editing and revision commands. The screenshot captured a dark blank area below that menu. Escape dismissed the menu. No repository mutation was attempted because the working content could not be verified.

This evidence cannot distinguish an actual webview rendering failure from a WebKit/compositor screenshot limitation. It is therefore a failed content-verification check, not a native production pass. The binary is a debug executable, and `Tauri.toml` names `http://localhost:6973` as the development frontend; that URL returned HTTP 200. No claim is made that the binary embeds the final production assets.

The application log contains GTK warnings about accelerators not being installed in an accelerator group. Alt+R still opened the menu. This check does not establish whether every accelerator works.

## Evidence and containment

Evidence is in `.taste-skill/studio/native/`: `process.json`, `window.json`, `launch.log`, `launch.png`, `menu.png`, `after-menu.png`, and `cleanup.json`. Captures were guarded by checking the active window PID against the launched app PID. The initial root-launched PID 859379 exited before a valid capture; this reviewer relaunched PID 895457 with the proper command `target/debug/gg --foreground /tmp/gg-native-studio-eu0300nn`.

An initial obsolete Hyprland focus-command attempt failed, and a screenshot command then captured the wrong active surface. That image was immediately deleted without being inspected or retained. Subsequent captures verified the own-window PID first. New Hyprland Lua dispatch syntax was used to focus the app and direct keyboard input to its exact address.

Only reviewer-launched PID 895457 was terminated after verifying its command line contained the isolated fixture path. The fixture directory was removed. Previous focus address `0x5a457140b7c0` was restored. No broad process kill, source edit, real-repository operation, or native mutation was performed.

## Limits

No physical phone, iOS/Android, macOS/Windows Tauri runtime, screen reader, touch hardware, native drag/drop, Save/Undo, or complete native keyboard-navigation pass was available in this check. Browser-fixture evidence elsewhere must not be described as native verification. Resolve the blank webview/capture ambiguity and rerun against a release binary before claiming native frontend parity.

## Follow-up: native runtime inspected and cause narrowed

The initial devURL inference above was incorrect: WebKit's actual inspected target is `tauri://localhost`, with embedded production assets including `assets/index-x6t3nZri.css`. JavaScript runs and the complete workspace DOM mounts. The blank is not an empty app DOM or a missing frontend script.

Using `WEBKIT_INSPECTOR_HTTP_SERVER=127.0.0.1:7465` on a newly isolated process exposed WebKit's target. The inspector transport requires `Target.sendMessageToTarget` around Runtime/Console calls. Default native Wayland returned **innerWidth −184224, innerHeight −200352, devicePixelRatio −0.010416666977107525**. HTML/body dimensions were correspondingly negative; CSS zoom was 1, transform none, and visibility visible. Console enable produced no replayed application errors. Exact runtime evidence is `negative-viewport.json`.

Setting GDK_SCALE/GDK_DPI_SCALE to 1 did not help. An isolated GTK config specifying gtk-xft-dpi=98304 did not help. Changing only the process backend to **GDK_BACKEND=x11** produced **innerWidth 1919, innerHeight 2087, DPR 1**, and the full workspace rendered visibly. `x11-render.png` was captured from the own PID and visually inspected: graph, revision, toolbar, and file pane all appear. A first graph-row annotation overlaps the description in this narrow graph column and deserves a separate layout follow-up.

Under X11, sending Ctrl+K to the exact own window opened Commands and focused `#command-search`; Runtime inspection confirmed the dialog and search focus. Escape dismissed it. Native Alt+R menu had already been visibly verified in the initial Wayland shell. No mutation was attempted.

**Revised result:** native embedded frontend rendering and command keyboard path pass on X11. Default Wayland has a reproducible negative viewport/DPR blocker on this installed WebKitGTK/Hyprland combination. This is more specific than a screenshot ambiguity, but does not establish the responsible upstream component or justify an app-source workaround. Keep the Wayland failure explicit. No production source was changed.

Follow-up evidence: `debug-launch.log`, `debug-process.json`, `inspect.mjs`, `negative-viewport.json`, `x11-viewport.json`, `inspector.json` (Commands state), `x11-window.json`, `x11-render.png`, `debug-cleanup.json`. All reviewer debug processes were stopped individually; the debug repository and temporary GTK config were removed; previous focus restored. The local inspector listener ended with its process.

## Native graph reference paint follow-up

A further isolated X11 process tested runtime CSS only, without a source edit or rebuild. `refs-baseline.png` reproduces bookmarks from later rows painted over the first row. Applying `.refs { overflow-x: hidden !important; }` fixes their actual visible positions in `refs-hidden.png`. Applying `overflow-x: clip` also fixes the visible positions in `refs-clip.png`. All three captures were visually inspected: the immutable bookmark appears on its correct revision row and the remote bookmark returns to its correct later row; the first-row pile-up disappears. Thus removing the horizontal scrolling behavior is a native-verified remedy, rather than an inference from DOM geometry.

Runtime computed values and row Y positions are in `refs-results.json`; reproducible probe is `refs-probe.mjs`. The root implementation owner was notified to apply the narrow CSS change. This reviewer made no source edit. The own process and fixture were removed and previous focus restored (`refs-cleanup.json`).

## Bundled-font native check

After the font change, `nix develop -c cargo build --bin gg` passed (15.45s), embedding the fresh frontend assets. The build timestamp and launch timestamp are recorded in `fonts-process.json`. The default shell's old rustc could not build this project; the project Nix development shell was used successfully.

The isolated X11 relaunch now failed GTK initialization before app startup. This host's X socket directory contained `X0_` rather than `X0` for DISPLAY=:0. No socket, global settings, or user repository was modified, and this check does not establish an app regression. The earlier X11 visual check remains evidence for the previous asset build only.

One isolated Wayland inspector check confirmed actual `tauri://localhost` font loading from the fresh embedded assets: IBM Plex Sans 400/500/600 and JetBrains Mono 400/500/600 all reached `loaded` (600 explicitly requested through FontFaceSet). Body computed stack starts with IBM Plex Sans; actual diff PRE and CODE nodes compute JetBrains Mono. Runtime `--stack-code` has JetBrains Mono followed by UI/OS monospace fallbacks. Raw results and probe are `fonts-state.json` and `fonts-probe.mjs`.

The known Wayland negative-DPR/viewport issue persists; computed font sizes are consequently nonsensical. **Native visual readability and narrow/native phone layout after the font change remain unverified.** The font load and family selection check passes; it must not be described as a native visual pass. Chrome visual coverage is recorded separately. Own process/fixture cleaned and focus restored (`fonts-cleanup.json`).
