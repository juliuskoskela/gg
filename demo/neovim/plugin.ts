import { spawn, execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { realpath } from "node:fs/promises";
import { promisify } from "node:util";
import { attach, type Buffer as NeovimBuffer } from "neovim";
import { WebSocketServer } from "ws";
import type { Plugin } from "vite";

let exec = promisify(execFile);

// deliberately dev-only: production needs a Rust-owned process and repository policy.
export function neovimDemo(): Plugin {
    let enabled = process.env.GG_NEOVIM_DEMO === "1";
    let token = randomBytes(24).toString("hex");
    return {
        name: "gg-neovim-demo",
        resolveId(id) { if (id === "virtual:gg-neovim") return "\0gg-neovim"; },
        load(id) { if (id === "\0gg-neovim") return `export let enabled = ${enabled}; export let token = ${JSON.stringify(enabled ? token : "")};`; },
        async configureServer(server) {
            if (!enabled) return;
            let repository = await realpath(process.env.GG_NEOVIM_REPOSITORY ?? process.cwd());
            let sockets = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
            let sessions = new Set<ReturnType<typeof spawn>>();
            server.httpServer?.on("upgrade", (request, socket, head) => {
                let url = new URL(request.url ?? "/", "http://localhost");
                if (url.pathname !== "/__gg_neovim") return;
                let origin: URL;
                try { origin = new URL(request.headers.origin ?? ""); } catch { socket.destroy(); return; }
                if (url.searchParams.get("token") !== token || origin.host !== request.headers.host || sockets.clients.size >= 8) { socket.destroy(); return; }
                sockets.handleUpgrade(request, socket, head, ws => sockets.emit("connection", ws));
            });
            sockets.on("connection", socket => {
                let proc = spawn("nvim", ["--embed", "-u", "NONE", "--noplugin", "-n", "-i", "NONE"], { cwd: repository, stdio: ["pipe", "pipe", "pipe"] });
                sessions.add(proc);
                let nvim = attach({ proc });
                let send = (value: unknown) => { if (socket.readyState === 1) socket.send(JSON.stringify(value)); };
                let buffers = new Map<string, NeovimBuffer>();
                let chain = Promise.resolve();
                let initialized = false;
                let lastTheme = "";
                proc.on("error", error => send({ type: "error", message: `Could not start Neovim: ${error.message}` }));
                proc.on("exit", () => { sessions.delete(proc); socket.close(); });
                proc.stderr?.resume();
                nvim.on("notification", (method: string, args: unknown[]) => {
                    if (method !== "redraw") return;
                    // window handles in unrelated events are node-client objects, not JSON.
                    let supported = new Set(["grid_resize", "grid_line", "grid_clear", "grid_scroll", "grid_cursor_goto", "hl_attr_define", "default_colors_set", "mode_change", "flush"]);
                    send({ type: "redraw", events: (args as [string, ...unknown[]][]).filter(event => supported.has(event[0])).map(event => event[0] === "hl_attr_define" ? [event[0], ...event.slice(1).map(call => (call as unknown[]).slice(0, 2))] : event) });
                });
                socket.on("close", () => { proc.kill(); sessions.delete(proc); });
                socket.on("message", raw => {
                    chain = chain.then(async () => {
                        let message = JSON.parse(raw.toString());
                        if (message.type === "init") {
                            if (initialized) return;
                            initialized = true;
                            await nvim.request("nvim_ui_attach", [80, 24, { rgb: true, ext_linegrid: true }]);
                            await nvim.command("set number mouse=a laststatus=0 showtabline=0 noshowmode noruler nomodeline nowrap signcolumn=no shortmess+=I");
                            send({ type: "ready", version: await nvim.request("nvim_eval", ["execute('version')->split('\\n')[0]"]) });
                        } else if (!initialized) return;
                        else if (message.type === "input" && typeof message.keys === "string" && message.keys.length < 16384) await nvim.input(message.keys);
                        else if (message.type === "paste" && typeof message.text === "string" && message.text.length < 16384) await nvim.request("nvim_paste", [message.text, true, -1]);
                        else if (message.type === "resize") await nvim.request("nvim_ui_try_resize", [Math.max(12, Math.min(500, Math.floor(message.cols) || 80)), Math.max(3, Math.min(200, Math.floor(message.rows) || 24))]);
                        else if (message.type === "mouse") {
                            if (!["left", "wheel"].includes(message.button) || !["press", "release", "drag", "up", "down"].includes(message.action)) return;
                            await nvim.request("nvim_input_mouse", [message.button, message.action, "", 0, Math.max(0, Math.min(199, message.row | 0)), Math.max(0, Math.min(499, message.col | 0))]);
                        } else if (message.type === "theme") {
                            let theme = message.colors as Record<string, string>;
                            if (!theme || Object.values(theme).some(value => !/^#[\da-f]{6}$/i.test(value))) return;
                            if (JSON.stringify(theme) === lastTheme) return;
                            lastTheme = JSON.stringify(theme);
                            let groups: Record<string, object> = {
                                Normal: { fg: theme.text, bg: theme.background }, NormalFloat: { fg: theme.text, bg: theme.raised },
                                LineNr: { fg: theme.muted }, CursorLineNr: { fg: theme.accent }, EndOfBuffer: { fg: theme.background },
                                Visual: { bg: theme.selection }, Search: { fg: theme.background, bg: theme.accent },
                                Comment: { fg: theme.muted, italic: true }, String: { fg: theme.positive }, Character: { fg: theme.positive },
                                Statement: { fg: theme.purple }, Keyword: { fg: theme.purple }, Type: { fg: theme.accent },
                                Function: { fg: theme.accent }, Identifier: { fg: theme.text }, Constant: { fg: theme.warning },
                                PreProc: { fg: theme.purple }, Special: { fg: theme.warning }, StatusLine: { fg: theme.text, bg: theme.raised },
                                MsgArea: { fg: theme.muted, bg: theme.background }, NonText: { fg: theme.muted },
                            };
                            for (let [name, value] of Object.entries(groups)) await nvim.request("nvim_set_hl", [0, name, value]);
                        } else if (message.type === "open") {
                            if (await realpath(message.repository) !== repository) throw Error("This demo is attached to a different repository. Restart with GG_NEOVIM_REPOSITORY set to this workspace.");
                            if (!/^[a-f\d]{40,128}$/.test(message.commit) || typeof message.path !== "string" || !message.path || message.path.startsWith("/") || message.path.split("/").includes("..")) throw Error("Invalid revision or file path.");
                            let key = `${message.commit}:${message.path}`;
                            let buffer = buffers.get(key);
                            if (!buffer) {
                                let { stdout } = await exec("jj", ["--ignore-working-copy", "--color=never", "file", "show", "-r", message.commit, `root-file:${JSON.stringify(message.path)}`], { cwd: repository, maxBuffer: 2 * 1024 * 1024, timeout: 10000 });
                                if (stdout.includes("\0")) throw Error("Binary files cannot be edited in this demo.");
                                buffer = await nvim.request("nvim_create_buf", [true, true]) as NeovimBuffer;
                                await nvim.request("nvim_buf_set_name", [buffer, `gg-demo://${message.commit}/${message.path}`]);
                                await nvim.request("nvim_buf_set_lines", [buffer, 0, -1, false, stdout.replace(/\n$/, "").split("\n")]);
                                buffers.set(key, buffer);
                                // nofile buffers keep experiments separate from checked-out source.
                                await nvim.request("nvim_set_option_value", ["buftype", "nofile", { buf: buffer }]);
                                await nvim.request("nvim_set_option_value", ["bufhidden", "hide", { buf: buffer }]);
                                await nvim.request("nvim_set_option_value", ["modified", false, { buf: buffer }]);
                            }
                            await nvim.input("<Esc>");
                            await nvim.request("nvim_set_current_buf", [buffer]);
                            await nvim.command("filetype detect");
                            await nvim.command("syntax enable");
                            send({ type: "opened", key, path: message.path });
                        }
                    }).catch(error => send({ type: "error", message: String(error.message ?? error) }));
                });
            });
            server.httpServer?.once("close", () => { sessions.forEach(proc => proc.kill()); sockets.close(); });
        },
    };
}
