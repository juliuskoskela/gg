import { isTauri } from "../events";

export type TerminalOutput =
    | { type: "data"; data: number[] }
    | { type: "ready" }
    | { type: "exit"; code: number | null }
    | { type: "error"; message: string };

export interface TerminalConnection {
    input(data: Uint8Array): Promise<void>;
    resize(cols: number, rows: number): Promise<void>;
    close(): void;
}

export async function connectTerminal(directory: string, receive: (output: TerminalOutput) => void): Promise<TerminalConnection> {
    if (isTauri()) {
        let { invoke, Channel } = await import("@tauri-apps/api/core");
        let output = new Channel<TerminalOutput>();
        output.onmessage = receive;
        let id = await invoke<string>("terminal_open", { directory, output });
        receive({ type: "ready" });
        return {
            input: data => invoke("terminal_input", { id, data: Array.from(data) }),
            resize: (cols, rows) => invoke("terminal_resize", { id, cols, rows }),
            close: () => { void invoke("terminal_close", { id }); },
        };
    }

    let token = (window as Window & { __GG_TERMINAL_TOKEN__?: string }).__GG_TERMINAL_TOKEN__;
    if (!token) throw new Error("The terminal needs GG's backend. Open the URL printed by gg web.");
    let url = new URL("/api/terminal", window.location.href);
    url.protocol = "ws:";
    url.searchParams.set("token", token);
    url.searchParams.set("directory", directory);
    let socket = new WebSocket(url);
    socket.binaryType = "arraybuffer";
    let closed = false;
    let ready = false;
    socket.onmessage = event => {
        if (event.data instanceof ArrayBuffer) receive({ type: "data", data: Array.from(new Uint8Array(event.data)) });
        else {
            let output = JSON.parse(event.data) as TerminalOutput;
            if (output.type === "ready") ready = true;
            if (output.type === "exit" || output.type === "error") closed = true;
            receive(output);
        }
    };
    socket.onclose = () => {
        if (!closed) receive({ type: "error", message: ready ? "Terminal disconnected. Start a new shell to reconnect." : "Could not open the terminal connection." });
    };
    socket.onerror = () => { /* onclose reports the connection failure */ };
    return {
        input: async data => {
            if (socket.readyState !== WebSocket.OPEN || !ready) throw new Error("Terminal is not connected");
            socket.send(data);
        },
        resize: async (cols, rows) => {
            if (socket.readyState === WebSocket.OPEN && ready) socket.send(JSON.stringify({ type: "resize", cols, rows }));
        },
        close: () => { closed = true; socket.close(); },
    };
}
