import { get, writable } from "svelte/store";
import type { Command } from "../commands/registry";

export let zoomSteps = [.8, .9, 1, 1.1, 1.25, 1.5, 1.75, 2];
export let zoomStorageKey = "gg.ui.zoom";
export type ZoomState = { level: number; pending: boolean; error: string | null };

export function validZoom(value: unknown): number {
    let level = typeof value === "number" ? value : Number.NaN;
    return Number.isFinite(level) && level >= zoomSteps[0] && level <= zoomSteps.at(-1)! ? level : 1;
}

export function createZoomController(options: { apply: (level: number) => Promise<void>; read: () => unknown; save: (level: number) => void }) {
    let state = writable<ZoomState>({ level: 1, pending: false, error: null });
    let requested = 1, applied = 1, generation = 0;
    let queue = Promise.resolve();
    function set(level: number, persist = true) {
        requested = validZoom(level);
        let target = requested, request = ++generation;
        state.set({ level: target, pending: true, error: null });
        queue = queue.then(async () => {
            if (request !== generation) return;
            try {
                await options.apply(target);
                applied = target;
                if (request !== generation) return;
                // preferences describe a successfully applied zoom, not a failed request
                if (persist) { try { options.save(target); } catch { /* storage may be unavailable */ } }
                state.set({ level: target, pending: false, error: null });
            } catch {
                if (request !== generation) return;
                requested = applied;
                state.set({ level: applied, pending: false, error: "Couldn’t change app zoom. Try again." });
            }
        });
        return queue;
    }
    return {
        subscribe: state.subscribe,
        set,
        restore: () => { let saved: unknown; try { saved = options.read(); } catch { saved = 1; } return set(validZoom(saved), false); },
        increase: () => set(zoomSteps.find(level => level > requested) ?? zoomSteps.at(-1)!),
        decrease: () => set([...zoomSteps].reverse().find(level => level < requested) ?? zoomSteps[0]),
        reset: () => set(1),
    };
}

export let nativeZoomEnabled = writable(false);
export let appZoom = createZoomController({
    apply: async level => { let { getCurrentWebview } = await import("@tauri-apps/api/webview"); await getCurrentWebview().setZoom(level); },
    read: () => JSON.parse(localStorage.getItem(zoomStorageKey) ?? "1"),
    save: level => localStorage.setItem(zoomStorageKey, JSON.stringify(level)),
});

export function zoomCommands(state: ZoomState = get(appZoom), enabled = get(nativeZoomEnabled)): Command[] {
    if (!enabled) return [];
    let percentage = `${Math.round(state.level * 100)}%`;
    return [
        { id: "view.zoom-in", label: `Zoom in · ${percentage}`, icon: "zoom-in", scope: "App zoom", shortcut: "Ctrl/⌘ +", reason: state.level >= zoomSteps.at(-1)! ? "Maximum app zoom" : null, execute: () => appZoom.increase() },
        { id: "view.zoom-out", label: `Zoom out · ${percentage}`, icon: "zoom-out", scope: "App zoom", shortcut: "Ctrl/⌘ −", reason: state.level <= zoomSteps[0] ? "Minimum app zoom" : null, execute: () => appZoom.decrease() },
        { id: "view.zoom-reset", label: "Actual size · 100%", icon: "maximize", scope: "App zoom", shortcut: "Ctrl/⌘ 0", reason: null, execute: () => appZoom.reset() },
    ];
}

export function zoomShortcut(event: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey">): string | null {
    if (!(event.ctrlKey || event.metaKey) || event.altKey) return null;
    return event.key === "+" || event.key === "=" ? "view.zoom-in" : event.key === "-" ? "view.zoom-out" : event.key === "0" ? "view.zoom-reset" : null;
}

export function executeZoomCommand(id: string) {
    let command = zoomCommands().find(command => command.id === id);
    if (command && !command.reason) return command.execute();
}
