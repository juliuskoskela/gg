import { describe, expect, it } from "vitest";
import { DEFAULT_TREE_HEIGHT, DEFAULT_TREE_WIDTH, MIN_TREE_HEIGHT, MIN_TREE_WIDTH, clampTreeHeight, clampTreeWidth, createFilesLayout, maxTreeHeight, maxTreeWidth } from "./layout";
import { get } from "svelte/store";

function memory(initial?: string) {
    let values = new Map<string, string>();
    if (initial !== undefined) values.set("gg.files.layout", initial);
    return { values, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
}

describe("files layout", () => {
    it("starts open at the default width without wrapping", () => {
        expect(get(createFilesLayout(memory()))).toEqual({ treeOpen: true, treeSide: "left", treeWidth: DEFAULT_TREE_WIDTH, treeHeight: DEFAULT_TREE_HEIGHT, wrap: false });
    });

    it("restores and persists under gg.files.layout", () => {
        let storage = memory(JSON.stringify({ treeOpen: false, treeSide: "bottom", treeWidth: 300, treeHeight: 200, wrap: true }));
        let layout = createFilesLayout(storage);
        expect(get(layout)).toEqual({ treeOpen: false, treeSide: "bottom", treeWidth: 300, treeHeight: 200, wrap: true });
        layout.toggleTree();
        layout.setTreeWidth(320.4);
        layout.toggleWrap();
        layout.setTreeSide("top");
        layout.setTreeHeight(333.3);
        expect(JSON.parse(storage.values.get("gg.files.layout")!)).toEqual({ treeOpen: true, treeSide: "top", treeWidth: 320, treeHeight: 333, wrap: false });
    });

    it("ignores corrupt storage and bad numbers", () => {
        expect(get(createFilesLayout(memory("{nope")))).toEqual({ treeOpen: true, treeSide: "left", treeWidth: DEFAULT_TREE_WIDTH, treeHeight: DEFAULT_TREE_HEIGHT, wrap: false });
        expect(get(createFilesLayout(memory(JSON.stringify({ treeWidth: "wide", treeOpen: 3, treeSide: "middle" }))))).toEqual({ treeOpen: true, treeSide: "left", treeWidth: DEFAULT_TREE_WIDTH, treeHeight: DEFAULT_TREE_HEIGHT, wrap: false });
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

    it("reads the stored start and end sides as left and right", () => {
        let stored = (side: string) => get(createFilesLayout(memory(JSON.stringify({ treeOpen: true, treeSide: side, treeWidth: 300, wrap: false }))));
        expect(stored("start")).toEqual({ treeOpen: true, treeSide: "left", treeWidth: 300, treeHeight: DEFAULT_TREE_HEIGHT, wrap: false });
        expect(stored("end")).toMatchObject({ treeSide: "right", treeWidth: 300 });
        expect(stored("top").treeSide).toBe("top");
    });

    it("migrates the stored layout on the next write", () => {
        let storage = memory(JSON.stringify({ treeOpen: true, treeSide: "end", treeWidth: 300, wrap: false }));
        createFilesLayout(storage).setTreeOpen(false);
        expect(JSON.parse(storage.values.get("gg.files.layout")!)).toEqual({ treeOpen: false, treeSide: "right", treeWidth: 300, treeHeight: DEFAULT_TREE_HEIGHT, wrap: false });
    });

    it("remembers width and height separately, whichever side the tree is on", () => {
        let layout = createFilesLayout(memory());
        layout.setTreeWidth(320);
        layout.setTreeHeight(180);
        layout.setTreeSide("bottom");
        layout.setTreeSide("right");
        expect(get(layout)).toMatchObject({ treeWidth: 320, treeHeight: 180, treeSide: "right" });
        layout.setTreeHeight(10);
        expect(get(layout).treeHeight).toBe(MIN_TREE_HEIGHT);
        expect(get(layout).treeWidth).toBe(320);
    });

    it("keeps the height between 120px and 70% of the view", () => {
        expect(clampTreeHeight(50, 1000)).toBe(MIN_TREE_HEIGHT);
        expect(clampTreeHeight(900, 1000)).toBe(700);
        expect(clampTreeHeight(Number.NaN, 1000)).toBe(DEFAULT_TREE_HEIGHT);
        expect(maxTreeHeight(100)).toBe(MIN_TREE_HEIGHT);
    });
});
