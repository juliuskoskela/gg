import { writable } from "svelte/store";

/** the changed-files drawer of the diff view; height is remembered while closed */
export type FilesDrawer = { open: boolean; height: number };
export let DEFAULT_HEIGHT = 240;
export let MIN_HEIGHT = 120;
export let CLOSE_BELOW = 60;
export let MAX_FRACTION = 0.7;
export let KEY_STEP = 24;
let KEY = "gg.diff.files";
let DEFAULT: FilesDrawer = { open: false, height: DEFAULT_HEIGHT };

/** the tallest the drawer may be in a view of this height, never below the minimum */
export function maxHeight(viewHeight: number): number {
    return Math.max(MIN_HEIGHT, Math.floor(viewHeight * MAX_FRACTION));
}

export function clampHeight(height: number, viewHeight: number): number {
    if (!Number.isFinite(height)) return DEFAULT_HEIGHT;
    return Math.min(maxHeight(viewHeight), Math.max(MIN_HEIGHT, Math.round(height)));
}

/** a drag released this low closes the drawer instead of resizing it */
export function shouldClose(height: number): boolean {
    return height < CLOSE_BELOW;
}

function restore(storage?: Pick<Storage, "getItem">): FilesDrawer {
    try {
        let value = JSON.parse(storage?.getItem(KEY) ?? "null");
        if (value && typeof value === "object") {
            return {
                open: value.open === true,
                height: typeof value.height === "number" && Number.isFinite(value.height) ? Math.max(MIN_HEIGHT, value.height) : DEFAULT_HEIGHT,
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
        /** height is stored unclamped to the view so a small window does not shrink the remembered size */
        setHeight(height: number) { update(value => ({ ...value, height: Math.max(MIN_HEIGHT, Math.round(height)) })); },
        set(next: FilesDrawer) { update(() => ({ open: next.open, height: Math.max(MIN_HEIGHT, next.height) })); },
    };
}

let storage: Storage | undefined;
try { if (typeof localStorage !== "undefined") storage = localStorage; } catch { /* storage can be blocked */ }
export let filesDrawer = createFilesDrawer(storage);
