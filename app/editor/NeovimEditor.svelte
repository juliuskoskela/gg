<script lang="ts">
    import { onMount } from "svelte";
    import { token } from "virtual:gg-neovim";
    import { effectiveTheme } from "../display/theme";
    import { NeovimGrid, type Redraw } from "./grid";
    import { GridRenderer } from "./renderer";
    export let repository: string;
    export let commit: string;
    export let path: string;
    export let visible = true;
    let host: HTMLDivElement;
    let canvas: HTMLCanvasElement;
    let input: HTMLTextAreaElement;
    let socket: WebSocket | undefined;
    let renderer: GridRenderer | undefined;
    let grid = new NeovimGrid();
    let ready = false;
    let error = "";
    let opened = "";
    let mode = "normal";
    let screenText = "";
    let frame = 0;
    let dimensions = "";
    let requested = "";
    let composing = false;
    let dragging = false;
    let wheel = 0;
    let send = (message: object) => { if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message)); };
    $: if (ready && path && commit && repository) open(repository, commit, path);
    $: if (ready && $effectiveTheme) theme();
    $: if (visible && ready) requestAnimationFrame(resize);
    function open(repo: string, revision: string, file: string) {
        let key = `${repo}:${revision}:${file}`;
        if (requested === key) return;
        requested = key; error = ""; opened = "";
        send({ type: "open", repository: repo, commit: revision, path: file });
    }
    function theme() {
        if (!host) return;
        let probe = document.createElement("span"); host.append(probe);
        let color = (name: string) => {
            probe.style.color = `var(${name})`;
            let rgb = getComputedStyle(probe).color.match(/[\d.]+/g)?.slice(0, 3).map(Number) ?? [128, 128, 128];
            return "#" + rgb.map(value => Math.round(value).toString(16).padStart(2, "0")).join("");
        };
        send({ type: "theme", colors: { text: color("--text"), background: color("--surface"), raised: color("--raised"), muted: color("--muted"), accent: color("--accent"), selection: color("--selection-bg"), positive: color("--positive"), warning: color("--diffs-token-constant"), purple: color("--diffs-token-keyword") } });
        probe.remove();
    }
    function resize() {
        if (!ready || !renderer || !host?.clientWidth || !host.clientHeight) return;
        let next = renderer.resize(host.clientWidth, host.clientHeight, getComputedStyle(host));
        let key = `${next.cols}:${next.rows}`;
        if (dimensions !== key) { dimensions = key; send({ type: "resize", ...next }); }
        paint();
    }
    function paint() {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => { renderer?.render(); mode = grid.mode; screenText = grid.rows.map(row => row.map(cell => cell.text).join("").trimEnd()).join("\n"); });
    }
    function text(value: string) { if (value) send({ type: "input", keys: value.replace(/</g, "<LT>") }); }
    function keydown(event: KeyboardEvent) {
        // let GG+ own palette/save shortcuts outside the focused editor.
        event.stopPropagation();
        if (event.isComposing || composing || event.key === "Process") return;
        if ((event.ctrlKey || event.metaKey) && ["v", "c", "x"].includes(event.key.toLowerCase())) return;
        let special: Record<string, string> = { Escape: "Esc", Enter: "CR", Backspace: "BS", Delete: "Del", Tab: "Tab", ArrowUp: "Up", ArrowDown: "Down", ArrowLeft: "Left", ArrowRight: "Right", Home: "Home", End: "End", PageUp: "PageUp", PageDown: "PageDown" };
        let key = special[event.key];
        if (event.ctrlKey || event.altKey || event.metaKey) {
            if (event.key.length !== 1 && !key) return;
            key = `${event.ctrlKey ? "C-" : ""}${event.altKey ? "M-" : ""}${event.metaKey ? "D-" : ""}${event.shiftKey && special[event.key] ? "S-" : ""}${key ?? event.key}`;
        } else if (key && event.shiftKey) key = `S-${key}`;
        if (key) { event.preventDefault(); send({ type: "input", keys: `<${key}>` }); }
    }
    function mouse(event: PointerEvent, action: string) {
        if (!renderer || !opened || error) return;
        let bounds = host.getBoundingClientRect();
        send({ type: "mouse", button: "left", action, row: Math.floor((event.clientY - bounds.top) / renderer.cellHeight), col: Math.floor((event.clientX - bounds.left) / renderer.cellWidth) });
    }
    onMount(() => {
        let alive = true;
        let observer: ResizeObserver;
        let themeObserver: MutationObserver;
        let connect = async () => {
            await document.fonts.ready;
            if (!alive) return;
            try { renderer = new GridRenderer(canvas, grid); }
            catch (cause) { error = String(cause); return; }
            let url = new URL("/__gg_neovim", window.location.href);
            url.protocol = location.protocol === "https:" ? "wss:" : "ws:";
            url.searchParams.set("token", token);
            socket = new WebSocket(url);
            socket.onopen = () => send({ type: "init" });
            socket.onmessage = event => {
                let message = JSON.parse(event.data);
                if (message.type === "ready") { ready = true; resize(); theme(); }
                else if (message.type === "redraw") { if (grid.apply(message.events as Redraw[])) paint(); }
                else if (message.type === "opened" && message.key === `${commit}:${path}`) { opened = message.key; error = ""; }
                else if (message.type === "error") error = message.message;
            };
            socket.onclose = () => { if (alive) { ready = false; error = "Neovim disconnected. Switch to Diff or reload the demo."; } };
            socket.onerror = () => { error = "Could not connect to the Neovim demo bridge."; };
            observer = new ResizeObserver(resize); observer.observe(host);
            themeObserver = new MutationObserver(() => { theme(); resize(); });
            themeObserver.observe(document.getElementById("shell")!, { attributes: true, attributeFilter: ["style", "class", "data-theme"] });
            window.addEventListener("resize", resize);
        };
        connect();
        return () => { alive = false; observer?.disconnect(); themeObserver?.disconnect(); window.removeEventListener("resize", resize); cancelAnimationFrame(frame); socket?.close(); renderer?.destroy(); };
    });
</script>

<div class="editor" hidden={!visible}>
    <div class="editor-note"><span>Neovim · {mode}</span><span>Scratch buffer · not saved to repository</span></div>
    <!-- keyboard and pointer events are forwarded to Neovim; the textarea owns input semantics. -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="editor-surface" bind:this={host}
        on:pointerdown={event => { if (event.button !== 0) return; event.preventDefault(); input.focus({ preventScroll: true }); dragging = true; host.setPointerCapture(event.pointerId); mouse(event, "press"); }}
        on:pointermove={event => { if (dragging) mouse(event, "drag"); }}
        on:pointerup={event => { if (dragging) mouse(event, "release"); dragging = false; }}
        on:pointercancel={() => dragging = false}
        on:wheel|nonpassive={event => { event.preventDefault(); wheel += event.deltaY; if (Math.abs(wheel) < 24) return; send({ type: "mouse", button: "wheel", action: wheel > 0 ? "down" : "up", row: 0, col: 0 }); wheel = 0; }}>
        <canvas bind:this={canvas} aria-hidden="true"></canvas>
        <pre class="screen-text">{screenText}</pre>
        <textarea bind:this={input} aria-label="Neovim scratch editor" aria-describedby="neovim-help" spellcheck="false" autocapitalize="off" autocomplete="off"
            on:keydown={keydown} on:input={() => { if (!composing) { text(input.value); input.value = ""; } }}
            on:compositionstart={() => composing = true} on:compositionend={() => { composing = false; text(input.value); input.value = ""; }}
            on:paste={event => { event.preventDefault(); send({ type: "paste", text: event.clipboardData?.getData("text/plain") ?? "" }); }}></textarea>
        {#if error}<div class="message" role="alert">{error}</div>{:else if !opened}<div class="message" role="status">{ready ? "Opening file…" : "Starting Neovim…"}</div>{/if}
    </div>
    <p id="neovim-help" class="editor-help">i to insert · Esc for normal mode · / to search · u to undo · buffers survive Diff / File switching</p>
</div>
<style>
    .editor { flex: 1; display: flex; flex-direction: column; min-height: 0; background: var(--surface); }
    .editor[hidden] { display: none; }
    .editor-note, .editor-help { display: flex; justify-content: space-between; gap: 8px; padding: 6px 12px; margin: 0; font-size: var(--type-caption); color: var(--muted); }
    .editor-note { border-bottom: 1px solid var(--rule); }
    .editor-surface { position: relative; flex: 1; min-height: 0; min-width: 0; overflow: hidden; font-family: var(--stack-code); font-size: var(--type-code); line-height: var(--code-leading); }
    canvas { display: block; width: 100%; height: 100%; position: absolute; inset: 0; }
    .screen-text { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: pre; }
    textarea { position: absolute; left: 0; top: 0; width: 1px; height: 1px; opacity: 0; padding: 0; border: 0; resize: none; }
    .editor-surface:focus-within { outline: 2px solid var(--accent); outline-offset: -2px; }
    .message { position: absolute; inset: 0; padding: 24px; background: var(--surface); color: var(--muted); }
    @media (max-width: 600px) { .editor-note { flex-wrap: wrap; } .editor-help { line-height: 1.5; } }
</style>
