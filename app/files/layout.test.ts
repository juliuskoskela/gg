import { describe, expect, it } from "vitest";
import { DEFAULT_TREE_WIDTH, MIN_TREE_WIDTH, clampTreeWidth, createFilesLayout, maxTreeWidth } from "./layout";
import { get } from "svelte/store";

function memory(initial?: string) {
    let values = new Map<string, string>();
    if (initial !== undefined) values.set("gg.files.layout", initial);
    return { values, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
}

describe("files layout", () => {
    it("starts open at the default width without wrapping", () => {
        expect(get(createFilesLayout(memory()))).toEqual({ treeOpen: true, treeSide: "start", treeWidth: DEFAULT_TREE_WIDTH, wrap: false });
    });

    it("restores and persists under gg.files.layout", () => {
        let storage = memory(JSON.stringify({ treeOpen: false, treeSide: "end", treeWidth: 300, wrap: true }));
        let layout = createFilesLayout(storage);
        expect(get(layout)).toEqual({ treeOpen: false, treeSide: "end", treeWidth: 300, wrap: true });
        layout.toggleTree();
        layout.setTreeWidth(320.4);
        layout.toggleWrap();
        layout.setTreeSide("start");
        expect(JSON.parse(storage.values.get("gg.files.layout")!)).toEqual({ treeOpen: true, treeSide: "start", treeWidth: 320, wrap: false });
    });

    it("ignores corrupt storage and bad numbers", () => {
        expect(get(createFilesLayout(memory("{nope")))).toEqual({ treeOpen: true, treeSide: "start", treeWidth: DEFAULT_TREE_WIDTH, wrap: false });
        expect(get(createFilesLayout(memory(JSON.stringify({ treeWidth: "wide", treeOpen: 3, treeSide: "middle" }))))).toEqual({ treeOpen: true, treeSide: "start", treeWidth: DEFAULT_TREE_WIDTH, wrap: false });
    });

    it("works when storage throws", () => {
        let layout = createFilesLayout({ getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } });
        layout.setTreeOpen(false);
        expect(get(layout).treeOpen).toBe(false);
    });

    it("keeps the width between 180px and half the view, remembering the unclamped choice", () => {
        expect(clampTreeWidth(50, 1000)).toBe(MIN_TREE_WIDTH);
        expect(clampTreeWidth(900, 1000)).toBe(500);
        expect(clampTreeWidth(Number.NaN, 1000)).toBe(DEFAULT_TREE_WIDTH);
        expect(maxTreeWidth(200)).toBe(MIN_TREE_WIDTH);
        let layout = createFilesLayout(memory());
        layout.setTreeWidth(10);
        expect(get(layout).treeWidth).toBe(MIN_TREE_WIDTH);
        layout.setTreeWidth(700);
        expect(get(layout).treeWidth).toBe(700);
    });
});
