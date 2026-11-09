import { writable } from "svelte/store";
import type { Terminal, FitAddon } from "ghostty-web";
import { connectTerminal, type TerminalConnection, type TerminalOutput } from "./transport";
import { terminalTheme } from "./theme";
import { terminalAppearance } from "./appearance";

export type TerminalState = { phase: "starting" | "running" | "exited" | "error"; message: string; screen: string };
let sessions = new Map<string, TerminalSession>();
let ghostty: Promise<typeof import("ghostty-web")> | undefined;

function loadGhostty() {
    return ghostty ??= import("ghostty-web").then(async library => { await library.init(); return library; });
}

export function terminalSession(directory: string): TerminalSession {
    let session = sessions.get(directory);
    if (!session) { session = new TerminalSession(directory); sessions.set(directory, session); }
    return session;
}

export function closeTerminal(directory: string): void {
    sessions.get(directory)?.dispose();
    sessions.delete(directory);
}

// the renderer and PTY outlive a component remount when a dock panel moves.
export class TerminalSession {
    readonly state = writable<TerminalState>({ phase: "starting", message: "Starting shell…", screen: "" });
    readonly element = document.createElement("div");
    private terminal?: Terminal;
    private fit?: FitAddon;
    private applyAppearance?: ReturnType<typeof terminalAppearance>;
    private connection?: TerminalConnection;
    private starting?: Promise<void>;
    private disposed = false;
    private connected = false;
    private dimensions = "";
    private refreshTimer?: ReturnType<typeof setTimeout>;
    private screenTimer?: ReturnType<typeof setTimeout>;
    private encoder = new TextEncoder();
    private inputQueue = Promise.resolve();

    constructor(readonly directory: string) {
        this.element.className = "terminal-renderer";
        this.element.style.cssText = "width:100%;height:100%;min-width:0;min-height:0";
    }

    async mount(host: HTMLElement): Promise<void> {
        host.append(this.element);
        this.starting ??= this.start();
        await this.starting;
        if (!this.disposed) this.appearance();
    }

    private async start(): Promise<void> {
        try {
            let library = await loadGhostty();
            await document.fonts.ready;
            if (this.disposed) return;
            let style = getComputedStyle(this.element);
            let theme = terminalTheme(this.element);
            this.terminal = new library.Terminal({
                cols: 80, rows: 24, scrollback: 5000,
                fontFamily: style.fontFamily,
                /* design-token-allow typography: Ghostty canvas renderer requires numeric font size from the computed --font-id token */
                fontSize: parseFloat(style.fontSize),
                cursorBlink: !matchMedia("(prefers-reduced-motion: reduce)").matches,
                theme,
            });
            this.fit = new library.FitAddon();
            this.terminal.loadAddon(this.fit);
            this.terminal.open(this.element);
            this.applyAppearance = terminalAppearance(this.terminal, theme);
            this.element.setAttribute("role", "group");
            this.element.setAttribute("aria-label", "Terminal emulator");
            this.element.removeAttribute("aria-multiline");
            this.element.removeAttribute("contenteditable");
            this.element.tabIndex = -1;
            this.element.querySelector("canvas")?.setAttribute("aria-hidden", "true");
            this.terminal.textarea?.setAttribute("aria-label", "Workspace terminal. Press Control Shift F6 to leave the terminal.");
            this.terminal.attachCustomKeyEventHandler(event => {
                event.stopPropagation();
                if (event.ctrlKey && event.shiftKey && event.key === "F6") {
                    document.querySelector<HTMLButtonElement>("#terminal-restart button")?.focus();
                    return true;
                }
                return false;
            });
            this.terminal.onData(data => {
                // serialize paste chunks and keystrokes so input keeps its original order.
                let bytes = this.encoder.encode(data);
                this.inputQueue = this.inputQueue.then(async () => {
                    if (!this.connected) return;
                    for (let offset = 0; offset < bytes.length; offset += 16 * 1024) {
                        await this.connection?.input(bytes.slice(offset, offset + 16 * 1024));
                    }
                    this.refresh();
                }).catch(error => this.fail(error));
            });
            this.connection = await connectTerminal(this.directory, output => this.receive(output));
            if (this.disposed) { this.connection.close(); return; }
            this.resize();
        } catch (error) { if (!this.disposed) this.fail(error); }
    }

    private receive(output: TerminalOutput): void {
        if (this.disposed) return;
        if (output.type === "data") {
            this.terminal?.write(new Uint8Array(output.data));
            this.refresh();
            if (!this.screenTimer) this.screenTimer = setTimeout(() => {
                this.screenTimer = undefined;
                let buffer = this.terminal?.buffer.active;
                let lines: string[] = [];
                if (buffer) for (let row = buffer.viewportY; row < buffer.viewportY + (this.terminal?.rows ?? 0); row++) {
                    lines.push(buffer.getLine(row)?.translateToString(true) ?? "");
                }
                this.state.update(state => ({ ...state, screen: lines.join("\n") }));
            }, 150);
        } else if (output.type === "ready") {
            this.connected = true;
            this.state.update(state => ({ ...state, phase: "running", message: "" }));
            this.resize();
        } else if (output.type === "exit") {
            this.connected = false;
            this.state.update(state => ({ ...state, phase: "exited", message: output.code === null ? "Shell exited." : `Shell exited with code ${output.code}.` }));
            this.refresh();
        } else this.fail(output.message);
    }

    private fail(error: unknown): void {
        this.connected = false;
        this.connection?.close();
        this.state.update(state => ({ ...state, phase: "error", message: String(error) }));
    }

    private refresh(): void {
        if (this.refreshTimer) return;
        // throttle rather than debounce: long-running commands can keep changing files.
        this.refreshTimer = setTimeout(() => {
            this.refreshTimer = undefined;
            window.dispatchEvent(new Event("gg:refresh-repository"));
        }, 1000);
    }

    appearance(): void {
        if (!this.terminal || !this.element.isConnected) return;
        let style = getComputedStyle(this.element);
        let theme = terminalTheme(this.element);
        this.applyAppearance?.(theme);
        this.terminal.options.fontFamily = style.fontFamily;
        this.terminal.options.fontSize = parseFloat(style.fontSize);
        this.resize();
    }

    resize(): void {
        if (!this.terminal || !this.element.clientWidth || !this.element.clientHeight) return;
        let size = this.fit?.proposeDimensions();
        if (!size) return;
        let cols = Math.max(2, Math.min(500, size.cols));
        let rows = Math.max(1, Math.min(200, size.rows));
        this.terminal.resize(cols, rows);
        let dimensions = `${cols}:${rows}`;
        if (this.connected && this.connection && this.dimensions !== dimensions) {
            this.dimensions = dimensions;
            void this.connection.resize(cols, rows).catch(error => this.fail(error));
        }
    }

    focus(): void { this.terminal?.textarea?.focus({ preventScroll: true }); }

    dispose(): void {
        this.disposed = true;
        this.connected = false;
        clearTimeout(this.refreshTimer);
        clearTimeout(this.screenTimer);
        this.connection?.close();
        this.terminal?.dispose();
        this.element.remove();
    }
}
