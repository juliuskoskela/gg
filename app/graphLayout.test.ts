import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render } from "@testing-library/svelte";
import { get } from "svelte/store";
import { anchoredHistoryScroll, createHistoryDensity, historyDensity, historyDensityKey, historyRowSize } from "./graphLayout";
import { cleanupMocks, setupMocks } from "./mocks";
import type { RevHeader } from "./messages/RevHeader";
import type { EnhancedLine, EnhancedRow } from "./GraphLog.svelte";

let id = { change: { type: "ChangeId" as const, hex: "abcdefgh", prefix: "a", rest: "bcdefgh", offset: null, is_divergent: false }, commit: { type: "CommitId" as const, hex: "01234567", prefix: "0", rest: "1234567" } };
let header: RevHeader = { id, description: { lines: ["Fix parser"] }, refs: [], parent_ids: [id.commit], is_immutable: false, is_working_copy: false, has_conflict: false, working_copy_of: null, author: { name: "Test Author", email: "test@example.com", timestamp: "" } };

describe("history density", () => {
    beforeEach(() => { setupMocks(cmd => cmd === "query_log" ? { rows: [], has_more: false } : undefined); historyDensity.set("compact"); });
    afterEach(async () => { historyDensity.set("compact"); localStorage.removeItem(historyDensityKey); await cleanupMocks(); });

    it("persists the choice and ignores invalid or inaccessible storage", () => {
        let value = "invalid";
        let storage = { getItem: () => value, setItem: (_key: string, next: string) => { value = next; } };
        let density = createHistoryDensity(storage);
        expect(get(density)).toBe("compact");
        density.set("tall");
        expect(get(createHistoryDensity(storage))).toBe("tall");
        let blocked = createHistoryDensity({ getItem: () => { throw Error("blocked"); }, setItem: () => { throw Error("blocked"); } });
        blocked.set("tall");
        expect(get(blocked)).toBe("tall");
    });
    it("keeps compact touch rows at least 44px and tall rows at 60px", () => {
        expect(historyRowSize("compact", false)).toBe(32);
        expect(historyRowSize("compact", true)).toBe(44);
        expect(historyRowSize("tall", false)).toBe(60);
        expect(historyRowSize("tall", true)).toBe(60);
        expect(anchoredHistoryScroll(10.5 * 32, 32, 60)).toBe(10.5 * 60);
    });
    it("updates graph nodes, edge paths and drop zones together on a density change", async () => {
        let { default: GraphLog } = await import("./GraphLog.svelte");
        let line: EnhancedLine = { key: 1, type: "FromNode", source: [0, 0], target: [0, 1], indirect: false, parent: header, child: header };
        let rows: EnhancedRow[] = [0, 1].map(row => ({ revision: header, location: [0, row], padding: 0, lines: [], passingLines: [line] }));
        let props = { rows, rowHeight: 32, containerHeight: 120, containerWidth: 400, scrollTop: 0 };
        let { container, rerender } = render(GraphLog, { props });
        expect(container.querySelector("circle")?.getAttribute("cy")).toBe("16");
        expect(container.querySelector("path")?.getAttribute("d")).toBe("M9,20.5 L9,43.5");
        await rerender({ ...props, rowHeight: 60 });
        expect(container.querySelector("circle")?.getAttribute("cy")).toBe("30");
        expect(container.querySelector("path")?.getAttribute("d")).toBe("M9,34.5 L9,85.5");
        expect(container.querySelector('foreignObject[y="34.5"]')?.getAttribute("height")).toBe("51");
        expect(container.querySelector("g:nth-child(2)")?.getAttribute("transform")).toContain("60");
    });
    it("shows author only in tall history without changing primary text weights", async () => {
        let { default: RevisionObject } = await import("./objects/RevisionObject.svelte");
        let { container, queryByText, rerender } = render(RevisionObject, { props: { header, selected: false, rowHeight: 32 } });
        expect(queryByText("Test Author")).toBeNull();
        await rerender({ header, selected: false, rowHeight: 60, tall: true });
        let author = queryByText("Test Author")!;
        expect(getComputedStyle(author).fontWeight).toBe("400");
        expect(getComputedStyle(container.querySelector(".layout")!).height).toBe("60px");
        expect(getComputedStyle(container.querySelector(".desc")!).fontWeight).toBe("500");
    });
    it("preserves description space in narrow graphs while keeping references named", async () => {
        let { default: RevisionObject } = await import("./objects/RevisionObject.svelte");
        let target = document.createElement("div");
        target.style.cssText = "container:timeline / inline-size;width:330px;--leftpad:72px";
        document.body.append(target);
        let ref = { type: "LocalBookmark" as const, bookmark_name: "very-long-reference-name", has_conflict: false, is_synced: false, tracking_remotes: [], available_remotes: 0, potential_remotes: 0 };
        let { container, getByRole } = render(RevisionObject, { target, context: new Map([["settings", { markUnpushedBookmarks: false }]]), props: { header: { ...header, refs: [ref] }, selected: false, rowHeight: 32 } });
        expect(getComputedStyle(container.querySelector(".refs")!).display).toBe("flex");
        expect(getComputedStyle(container.querySelector(".refs .chip > span")!).display).toBe("none");
        expect(getByRole("option", { name: /^very-long-reference-name;/ })).not.toBeNull();
        expect(container.querySelector(".desc")!.getBoundingClientRect().width).toBeGreaterThan(100);
        expect(getByRole("option", { name: /^Fix parser;/ }).getAttribute("aria-label")).toContain("very-long-reference-name");
        target.remove();
    });
    it("exposes a labelled density choice and saves it", async () => {
        let { default: LogPane } = await import("./LogPane.svelte");
        let { getByRole } = render(LogPane, { props: { integrated: true, query_choices: { default: "@" }, latest_query: "@" } });
        let select = getByRole("combobox", { name: "History density" });
        await fireEvent.change(select, { target: { value: "tall" } });
        expect(get(historyDensity)).toBe("tall");
        expect(localStorage.getItem(historyDensityKey)).toBe("tall");
    });
});
