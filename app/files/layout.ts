import { writable } from "svelte/store";

/** the files view: tree pane visibility, side and width, and whether the editor wraps long lines */
export type TreeSide = "start" | "end";
export type FilesLayout = { treeOpen: boolean; treeSide: TreeSide; treeWidth: number; wrap: boolean };
export let DEFAULT_TREE_WIDTH = 260;
export let MIN_TREE_WIDTH = 180;
export let MAX_TREE_FRACTION = 0.5;
export let KEY_STEP = 24;
/** below this container width the tree and editor become two pages */
export let NARROW_WIDTH = 560;
let KEY = "gg.files.layout";
let DEFAULT: FilesLayout = { treeOpen: true, treeSide: "start", treeWidth: DEFAULT_TREE_WIDTH, wrap: false };

export function maxTreeWidth(viewWidth: number): number {
    return Math.max(MIN_TREE_WIDTH, Math.floor(viewWidth * MAX_TREE_FRACTION));
}

export function clampTreeWidth(width: number, viewWidth: number): number {
    if (!Number.isFinite(width)) return DEFAULT_TREE_WIDTH;
    return Math.min(maxTreeWidth(viewWidth), Math.max(MIN_TREE_WIDTH, Math.round(width)));
}

function restore(storage?: Pick<Storage, "getItem">): FilesLayout {
    try {
        let value = JSON.parse(storage?.getItem(KEY) ?? "null");
        if (value && typeof value === "object") {
            return {
                treeOpen: value.treeOpen !== false,
                treeSide: value.treeSide === "end" ? "end" : "start",
                treeWidth: typeof value.treeWidth === "number" && Number.isFinite(value.treeWidth) ? Math.max(MIN_TREE_WIDTH, value.treeWidth) : DEFAULT_TREE_WIDTH,
                wrap: value.wrap === true,
            };
        }
    } catch { /* fall back to the default */ }
    return DEFAULT;
}

export function createFilesLayout(storage?: Pick<Storage, "getItem" | "setItem">) {
    let store = writable<FilesLayout>(restore(storage));
    function update(change: (value: FilesLayout) => FilesLayout) {
        store.update(value => {
            let next = change(value);
            try { storage?.setItem(KEY, JSON.stringify(next)); } catch { /* the choice lasts this session */ }
            return next;
        });
    }
    return {
        subscribe: store.subscribe,
        setTreeOpen(treeOpen: boolean) { update(value => ({ ...value, treeOpen })); },
        toggleTree() { update(value => ({ ...value, treeOpen: !value.treeOpen })); },
        setTreeSide(treeSide: TreeSide) { update(value => ({ ...value, treeSide })); },
        /** stored unclamped to the view so a small window does not shrink the remembered width */
        setTreeWidth(width: number) { update(value => ({ ...value, treeWidth: Math.max(MIN_TREE_WIDTH, Math.round(width)) })); },
        setWrap(wrap: boolean) { update(value => ({ ...value, wrap })); },
        toggleWrap() { update(value => ({ ...value, wrap: !value.wrap })); },
    };
}

let storage: Storage | undefined;
try { if (typeof localStorage !== "undefined") storage = localStorage; } catch { /* storage can be blocked */ }
export let filesLayout = createFilesLayout(storage);
