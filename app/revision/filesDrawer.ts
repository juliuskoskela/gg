import { writable } from "svelte/store";
import { minPaneSize, parseSide, type PaneSide } from "../tree/placement";

/** the changed-files pane of the diff view; width and height are remembered separately, and while it is closed */
export type FilesDrawer = { open: boolean; side: PaneSide; width: number; height: number };
export let DEFAULT_WIDTH = 280;
export let DEFAULT_HEIGHT = 240;
export let MIN_WIDTH = minPaneSize("left");
export let MIN_HEIGHT = minPaneSize("top");
let KEY = "gg.diff.files";
let DEFAULT: FilesDrawer = { open: false, side: "bottom", width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT };

let stored = (value: unknown, minimum: number, fallback: number) => typeof value === "number" && Number.isFinite(value) ? Math.max(minimum, value) : fallback;

function restore(storage?: Pick<Storage, "getItem">): FilesDrawer {
    try {
        let value = JSON.parse(storage?.getItem(KEY) ?? "null");
        if (value && typeof value === "object") {
            return {
                open: value.open === true,
                // the first version stored only { open, height }, and its drawer was at the bottom
                side: parseSide(value.side, "bottom"),
                width: stored(value.width, MIN_WIDTH, DEFAULT_WIDTH),
                height: stored(value.height, MIN_HEIGHT, DEFAULT_HEIGHT),
            };
        }
    } catch { /* fall back to the default */ }
    return DEFAULT;
}

export function createFilesDrawer(storage?: Pick<Storage, "getItem" | "setItem">) {
    let store = writable<FilesDrawer>(restore(storage));
    function update(change: (value: FilesDrawer) => FilesDrawer) {
        store.update(value => {
            let next = change(value);
            try { storage?.setItem(KEY, JSON.stringify(next)); } catch { /* the choice lasts this session */ }
            return next;
        });
    }
    return {
        subscribe: store.subscribe,
        setOpen(open: boolean) { update(value => ({ ...value, open })); },
        toggle() { update(value => ({ ...value, open: !value.open })); },
        setSide(side: PaneSide) { update(value => ({ ...value, side })); },
        /** stored unclamped to the view so a small window does not shrink the remembered size */
        setWidth(width: number) { update(value => ({ ...value, width: Math.max(MIN_WIDTH, Math.round(width)) })); },
        setHeight(height: number) { update(value => ({ ...value, height: Math.max(MIN_HEIGHT, Math.round(height)) })); },
        set(next: FilesDrawer) { update(() => ({ open: next.open, side: next.side, width: Math.max(MIN_WIDTH, next.width), height: Math.max(MIN_HEIGHT, next.height) })); },
    };
}

let storage: Storage | undefined;
try { if (typeof localStorage !== "undefined") storage = localStorage; } catch { /* storage can be blocked */ }
export let filesDrawer = createFilesDrawer(storage);
