import { get } from "svelte/store";
import { describe, expect, it } from "vitest";
import { closePanel, createDock, defaultLayout, movePanel, openPanel, openPanels, restoreDock, setRatio } from "./dock";

describe("panel dock", () => {
    it("starts with timeline, description, tree, and diff", () => {
        expect(openPanels(defaultLayout())).toEqual(["timeline", "description", "tree", "diff"]);
    });

    it("adds edit beside diff and leaves diff open", () => {
        let next = openPanel(defaultLayout(), "edit");
        expect(openPanels(next)).toContain("diff");
        expect(openPanels(next)).toContain("edit");
        let group = findTabs(next, "diff");
        expect(group?.panels).toEqual(["diff", "edit"]);
        expect(group?.active).toBe("edit");
    });

    it("closes a panel without closing its neighbors", () => {
        let next = closePanel(defaultLayout(), "tree");
        expect(openPanels(next)).toEqual(["timeline", "description", "diff"]);
        expect(openPanels(closePanel(next, "timeline"))).toEqual(["description", "diff"]);
    });

    it("allows the last panel to close", () => {
        expect(closePanel({ type: "tabs", active: "timeline", panels: ["timeline"] }, "timeline")).toBeNull();
    });

    it("stacks a panel onto another tab strip", () => {
        let next = movePanel(defaultLayout(), "description", "timeline", "tab");
        expect(findTabs(next, "timeline")?.panels).toEqual(["timeline", "description"]);
        expect(openPanels(next).filter(id => id === "description")).toHaveLength(1);
    });

    it("splits a panel onto an edge", () => {
        let next = movePanel(defaultLayout(), "tree", "timeline", "bottom");
        expect(openPanels(next)).toContain("tree");
        expect(findTabs(next, "timeline")?.panels).toEqual(["timeline"]);
    });

    it("rejects a stored layout that repeats a panel", () => {
        expect(restoreDock({
            version: 1,
            root: { type: "tabs", active: "diff", panels: ["diff", "diff"] },
            compactActive: "diff",
        })).toBeNull();
    });

    it("restores a valid layout and ignores an unknown version", () => {
        let saved = { version: 1, root: { type: "tabs", active: "timeline", panels: ["timeline"] }, compactActive: "timeline" };
        expect(openPanels(restoreDock(saved)!.root)).toEqual(["timeline"]);
        expect(restoreDock({ ...saved, version: 2 })).toBeNull();
    });

    it("remembers an opened panel and a reset", () => {
        let memory = new Map<string, string>();
        let storage = { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => { memory.set(key, value); } };
        let layout = createDock(storage);
        layout.open("edit");
        expect(openPanels(get(layout).root)).toContain("edit");
        layout.close("timeline");
        expect(openPanels(get(layout).root)).not.toContain("timeline");
        layout.reset();
        expect(openPanels(get(layout).root)).toEqual(["timeline", "description", "tree", "diff"]);
        let restored = createDock(storage);
        expect(openPanels(get(restored).root)).toEqual(["timeline", "description", "tree", "diff"]);
    });

    it("keeps a resize inside the usable range", () => {
        let next = setRatio(defaultLayout(), [], 0.01);
        expect(next.type === "split" && next.ratio).toBe(0.16);
    });
});

function findTabs(node: ReturnType<typeof defaultLayout> | null, id: string): Extract<NonNullable<typeof node>, { type: "tabs" }> | null {
    if (!node) return null;
    if (node.type === "tabs") return node.panels.includes(id as never) ? node : null;
    return findTabs(node.first, id) ?? findTabs(node.second, id);
}
