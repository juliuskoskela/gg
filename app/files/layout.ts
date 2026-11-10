import { writable } from "svelte/store";
import { clampPaneSize, maxPaneSize, minPaneSize, parseSide, type PaneSide } from "../tree/placement";

/** the files view: tree pane visibility, side, width and height, and whether the editor wraps long lines */
export type TreeSide = PaneSide;
export type FilesLayout = { treeOpen: boolean; treeSide: TreeSide; treeWidth: number; treeHeight: number; wrap: boolean };
export let DEFAULT_TREE_WIDTH = 260;
export let DEFAULT_TREE_HEIGHT = 240;
export let MIN_TREE_WIDTH = minPaneSize("left");
export let MIN_TREE_HEIGHT = minPaneSize("top");
/** below this container width the tree and editor become two pages */
export let NARROW_WIDTH = 560;
let KEY = "gg.files.layout";
let DEFAULT: FilesLayout = { treeOpen: true, treeSide: "left", treeWidth: DEFAULT_TREE_WIDTH, treeHeight: DEFAULT_TREE_HEIGHT, wrap: false };

export function maxTreeWidth(viewWidth: number): number {
    return maxPaneSize("left", viewWidth);
}

export function clampTreeWidth(width: number, viewWidth: number): number {
    return clampPaneSize("left", width, viewWidth, DEFAULT_TREE_WIDTH);
}

export function maxTreeHeight(viewHeight: number): number {
    return maxPaneSize("top", viewHeight);
}

export function clampTreeHeight(height: number, viewHeight: number): number {
    return clampPaneSize("top", height, viewHeight, DEFAULT_TREE_HEIGHT);
}

let stored = (value: unknown, minimum: number, fallback: number) => typeof value === "number" && Number.isFinite(value) ? Math.max(minimum, value) : fallback;

function restore(storage?: Pick<Storage, "getItem">): FilesLayout {
    try {
        let value = JSON.parse(storage?.getItem(KEY) ?? "null");
        if (value && typeof value === "object") {
            return {
                treeOpen: value.treeOpen !== false,
                // earlier versions stored "start" and "end"
                treeSide: parseSide(value.treeSide, "left"),
                treeWidth: stored(value.treeWidth, MIN_TREE_WIDTH, DEFAULT_TREE_WIDTH),
                treeHeight: stored(value.treeHeight, MIN_TREE_HEIGHT, DEFAULT_TREE_HEIGHT),
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
        /** width and height are remembered separately, so changing the side does not lose either */
        setTreeHeight(height: number) { update(value => ({ ...value, treeHeight: Math.max(MIN_TREE_HEIGHT, Math.round(height)) })); },
        setWrap(wrap: boolean) { update(value => ({ ...value, wrap })); },
        toggleWrap() { update(value => ({ ...value, wrap: !value.wrap })); },
    };
}

let storage: Storage | undefined;
try { if (typeof localStorage !== "undefined") storage = localStorage; } catch { /* storage can be blocked */ }
export let filesLayout = createFilesLayout(storage);
