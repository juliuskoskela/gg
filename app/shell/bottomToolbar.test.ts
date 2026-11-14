import { get } from "svelte/store";
import { describe, expect, it } from "vitest";
import { BOTTOM_TOOLS, DEFAULT_BOTTOM_TOOLBAR, createBottomToolbarStore, isDefaultBottomToolbar, parseBottomToolbar } from "./bottomToolbar";

let KEY = "gg.ui.bottom-toolbar";

function memoryStorage(initial: Record<string, string> = {}) {
    let values = new Map(Object.entries(initial));
    return {
        values,
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => { values.set(key, value); },
        removeItem: (key: string) => { values.delete(key); },
    };
}

describe("bottom toolbar configuration", () => {
    it("puts the remote selector before Fetch and Push by default, with Undo and Redo at the other end", () => {
        expect(DEFAULT_BOTTOM_TOOLBAR).toEqual({ left: ["remote", "fetch", "push"], right: ["undo", "redo"] });
        expect(parseBottomToolbar(null)).toEqual(DEFAULT_BOTTOM_TOOLBAR);
        expect(BOTTOM_TOOLS.find(tool => tool.id === "remote")?.category).toBe("Repository");
    });

    it("falls back to the default for missing, malformed, foreign or wrongly versioned values", () => {
        for (let raw of [null, "", "not json", "null", "42", '"left"', "[]", "{}",
            JSON.stringify({ version: 2, left: ["fetch"], right: [] }),
            JSON.stringify({ version: 1, left: "fetch", right: [] }),
            JSON.stringify({ version: 1, left: ["fetch"] }),
            JSON.stringify({ version: 1, left: ["retired-tool"], right: [42, null] })]) {
            expect(parseBottomToolbar(raw), String(raw)).toEqual(DEFAULT_BOTTOM_TOOLBAR);
        }
    });

    it("keeps known tools in stored order, drops unknown ones and duplicates, and respects an emptied toolbar", () => {
        expect(parseBottomToolbar(JSON.stringify({ version: 1, left: ["push", "gone", "remote", "push"], right: ["remote", "terminal"] })))
            .toEqual({ left: ["push", "remote"], right: ["terminal"] });
        expect(parseBottomToolbar(JSON.stringify({ version: 1, left: [], right: [] }))).toEqual({ left: [], right: [] });
    });

    it("never hands out the shared default arrays", () => {
        let parsed = parseBottomToolbar(null);
        parsed.left.push("terminal");
        expect(DEFAULT_BOTTOM_TOOLBAR.left).toEqual(["remote", "fetch", "push"]);
    });

    it("loads stored choices and survives blocked storage", () => {
        let storage = memoryStorage({ [KEY]: JSON.stringify({ version: 1, left: ["fetch"], right: ["commands"] }) });
        expect(get(createBottomToolbarStore(storage))).toEqual({ left: ["fetch"], right: ["commands"] });

        let blocked = {
            getItem: () => { throw new Error("blocked"); },
            setItem: () => { throw new Error("blocked"); },
            removeItem: () => { throw new Error("blocked"); },
        };
        let toolbar = createBottomToolbarStore(blocked);
        expect(get(toolbar)).toEqual(DEFAULT_BOTTOM_TOOLBAR);
        toolbar.add("left", "terminal");
        expect(get(toolbar).left).toEqual(["remote", "fetch", "push", "terminal"]);
    });

    it("persists edits, and clears the stored value when the default returns", () => {
        let storage = memoryStorage();
        let toolbar = createBottomToolbarStore(storage);

        toolbar.add("right", "terminal");
        expect(JSON.parse(storage.values.get(KEY)!)).toEqual({ version: 1, left: ["remote", "fetch", "push"], right: ["undo", "redo", "terminal"] });
        // a tool lives on one side only
        toolbar.add("left", "terminal");
        expect(get(toolbar).left).not.toContain("terminal");

        toolbar.moveToSide("terminal", "left");
        toolbar.move("terminal", -1);
        expect(get(toolbar)).toEqual({ left: ["remote", "fetch", "terminal", "push"], right: ["undo", "redo"] });
        // moving past either end is a no-op
        toolbar.move("remote", -1);
        expect(get(toolbar).left[0]).toBe("remote");

        toolbar.remove("terminal");
        expect(isDefaultBottomToolbar(get(toolbar))).toBe(true);
        expect(storage.values.has(KEY)).toBe(false);

        toolbar.remove("remote");
        expect(parseBottomToolbar(storage.values.get(KEY)!)).toEqual({ left: ["fetch", "push"], right: ["undo", "redo"] });
        toolbar.reset();
        expect(get(toolbar)).toEqual(DEFAULT_BOTTOM_TOOLBAR);
        expect(storage.values.has(KEY)).toBe(false);
        expect(get(createBottomToolbarStore(storage))).toEqual(DEFAULT_BOTTOM_TOOLBAR);
    });
});
