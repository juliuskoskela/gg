import { get } from "svelte/store";
import { describe, expect, it } from "vitest";
import { type DockNode, type Edge, type PanelId, closePanel, createDock, defaultLayout, movePanel, openPanel, openPanels, restoreDock, setRatio } from "./dock";

describe("panel dock", () => {
    it("starts with timeline, description, tree, and diff", () => {
        expect(openPanels(defaultLayout())).toEqual(["timeline", "description", "tree", "diff"]);
    });

    it("opens revision tools to the right of Description without changing saved defaults", () => {
        let initial = defaultLayout();
        let next = openPanel(initial, "revision-tools");
        expect(openPanels(initial)).not.toContain("revision-tools");
        expect(next.type).toBe("split");
        if (next.type !== "split" || next.second.type !== "split") throw new Error("expected description region");
        let group = next.second.first;
        expect(group).toEqual({ type: "split", direction: "row", ratio: 0.68,
            first: { type: "tabs", active: "description", panels: ["description"] },
            second: { type: "tabs", active: "revision-tools", panels: ["revision-tools"] } });
        expect(openPanels(openPanel(next, "revision-tools")).filter(id => id === "revision-tools")).toHaveLength(1);
        expect(closePanel(next, "revision-tools")).toEqual(initial);
    });

    it("restores and moves revision tools like every other dock panel", () => {
        let root = openPanel(defaultLayout(), "revision-tools");
        root = movePanel(root, "revision-tools", "timeline", "tab");
        expect(findTabs(root, "timeline")?.panels).toEqual(["revision-tools", "timeline"]);
        let restored = restoreDock({ version: 1, root, compactActive: "revision-tools" });
        expect(restored).toEqual({ root, compactActive: "revision-tools" });
        let layout = createDock(null);
        layout.open("revision-tools");
        expect(get(layout).compactActive).toBe("revision-tools");
        layout.close("revision-tools");
        expect(openPanels(get(layout).root)).not.toContain("revision-tools");
    });

    it("opens and restores one Settings tab without changing review panels", () => {
        let memory = new Map<string, string>();
        let storage = { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => { memory.set(key, value); } };
        let layout = createDock(storage);
        layout.open("settings"); layout.open("settings");
        expect(openPanels(get(layout).root)).toEqual(["timeline", "settings", "description", "tree", "diff"]);
        expect(findTabs(get(layout).root, "timeline")?.active).toBe("settings");
        expect(get(createDock(storage)).compactActive).toBe("settings");
        layout.close("settings");
        expect(get(layout).root).toEqual(defaultLayout());
        layout.open("settings");
        expect(openPanels(get(layout).root).filter(id => id === "settings")).toHaveLength(1);
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
        expect(findTabs(next, "timeline")?.panels).toEqual(["description", "timeline"]);
        expect(openPanels(next).filter(id => id === "description")).toHaveLength(1);
    });

    it("splits a panel onto an edge", () => {
        let next = movePanel(defaultLayout(), "tree", "timeline", "bottom");
        expect(openPanels(next)).toContain("tree");
        expect(findTabs(next, "timeline")?.panels).toEqual(["timeline"]);
    });

    it.each(["left", "right", "top", "bottom"] as Edge[])("detaches active and inactive tabs onto the %s edge without losing panels", edge => {
        for (let active of ["diff", "edit"] as PanelId[]) {
            for (let dragged of ["diff", "edit"] as PanelId[]) {
                let initial: DockNode = { type: "split", direction: "row", ratio: 0.42,
                    first: { type: "tabs", active: "timeline", panels: ["timeline"] },
                    second: { type: "tabs", active, panels: ["diff", "edit"] } };
                let next = movePanel(initial, dragged, active, edge);
                expect(next.type).toBe("split");
                if (next.type !== "split" || next.second.type !== "split") throw new Error("expected a split inside the original group");
                expect(next.ratio).toBe(initial.ratio);
                expect(next.first).toBe(initial.first);
                let group = next.second;
                expect(group.direction).toBe(edge === "left" || edge === "right" ? "row" : "column");
                let incomingFirst = edge === "left" || edge === "top";
                expect(incomingFirst ? group.first : group.second).toEqual({ type: "tabs", active: dragged, panels: [dragged] });
                let sibling = dragged === "diff" ? "edit" : "diff";
                expect(incomingFirst ? group.second : group.first).toEqual({ type: "tabs", active: sibling, panels: [sibling] });
                expect(openPanels(next).sort()).toEqual(["diff", "edit", "timeline"]);
                expect(initial.second).toEqual({ type: "tabs", active, panels: ["diff", "edit"] });
            }
        }
    });

    it("inserts moved tabs immediately before the target, within or between groups", () => {
        let initial: DockNode = { type: "tabs", active: "tree", panels: ["timeline", "description", "tree", "diff"] };
        let earlier = movePanel(initial, "diff", "description", "tab");
        expect(findTabs(earlier, "diff")).toEqual({ type: "tabs", active: "diff", panels: ["timeline", "diff", "description", "tree"] });
        let later = movePanel(earlier, "timeline", "tree", "tab");
        expect(findTabs(later, "timeline")?.panels).toEqual(["diff", "description", "timeline", "tree"]);
        expect(openPanels(later).sort()).toEqual(openPanels(initial).sort());
        let separate = movePanel(defaultLayout(), "tree", "description", "tab");
        expect(findTabs(separate, "description")?.panels).toEqual(["tree", "description"]);
        expect(openPanels(separate).sort()).toEqual(openPanels(defaultLayout()).sort());
    });

    it("moves a tab to the end of its own or another group", () => {
        let initial: DockNode = { type: "tabs", active: "timeline", panels: ["timeline", "description", "diff"] };
        let reordered = movePanel(initial, "timeline", "timeline", "tab-end");
        expect(reordered).toEqual({ type: "tabs", active: "timeline", panels: ["description", "diff", "timeline"] });
        let moved = movePanel(defaultLayout(), "tree", "description", "tab-end");
        expect(findTabs(moved, "description")?.panels).toEqual(["description", "tree"]);
        expect(openPanels(moved).sort()).toEqual(openPanels(defaultLayout()).sort());
        let singleton: DockNode = { type: "tabs", active: "diff", panels: ["diff"] };
        expect(movePanel(singleton, "diff", "diff", "tab-end")).toBe(singleton);
    });

    it("leaves a self tab drop and a singleton self split unchanged", () => {
        let group: DockNode = { type: "tabs", active: "diff", panels: ["diff", "edit"] };
        expect(movePanel(group, "edit", "edit", "tab")).toBe(group);
        let singleton: DockNode = { type: "tabs", active: "diff", panels: ["diff"] };
        for (let edge of ["tab", "left", "right", "top", "bottom"] as Edge[]) {
            expect(movePanel(singleton, "diff", "diff", edge)).toBe(singleton);
        }
        expect(movePanel(group, "timeline", "diff", "tab")).toBe(group);
        expect(movePanel(group, "diff", "timeline", "right")).toBe(group);
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
