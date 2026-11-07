import "./global.css";
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
        expect(historyRowSize("compact", false)).toBe(28);
        expect(historyRowSize("compact", true)).toBe(44);
        expect(historyRowSize("tall", false)).toBe(48);
        expect(historyRowSize("tall", true)).toBe(48);
        expect(anchoredHistoryScroll(10.5 * 28, 28, 48)).toBe(10.5 * 48);
    });
    it("keeps minimum bookmark clearance in condensed rows", async () => {
        let { default: RevisionObject } = await import("./objects/RevisionObject.svelte");
        let target = document.createElement("div");
        target.id = "shell";
        target.style.cssText = "width:600px;--leftpad:24px";
        document.body.append(target);
        let ref = { type: "LocalBookmark" as const, bookmark_name: "main", has_conflict: false, is_synced: true, tracking_remotes: [], available_remotes: 0, potential_remotes: 0 };
        let { container, unmount } = render(RevisionObject, { target, context: new Map([["settings", { markUnpushedBookmarks: false }]]), props: { header: { ...header, refs: [ref, { ...ref, bookmark_name: "release" }] }, selected: false } });
        let row = container.querySelector(".layout")!.getBoundingClientRect();
        let chips = [...container.querySelectorAll(".refs .chip")].map(chip => chip.getBoundingClientRect());
        expect(row.height).toBe(28);
        expect(chips).toHaveLength(2);
        for (let chip of chips) {
            expect(chip.top - row.top).toBeGreaterThanOrEqual(3);
            expect(row.bottom - chip.bottom).toBeGreaterThanOrEqual(3);
        }
        expect(chips[1].left - chips[0].right).toBeGreaterThanOrEqual(6);
        let description = container.querySelector(".desc")!.getBoundingClientRect();
        expect(chips[0].left - description.right).toBeGreaterThanOrEqual(8);
        unmount(); target.remove();
    });
    it("updates graph nodes, edge paths and drop zones together on a density change", async () => {
        let { default: GraphLog } = await import("./GraphLog.svelte");
        let line: EnhancedLine = { key: 1, type: "FromNode", source: [0, 0], target: [0, 1], indirect: false, parent: header, child: header };
        let rows: EnhancedRow[] = [0, 1].map(row => ({ revision: header, location: [0, row], padding: 0, lines: [], passingLines: [line] }));
        let props = { rows, authorSpace: 0, rowHeight: 32, containerHeight: 120, containerWidth: 400, scrollTop: 0 };
        let { container, rerender } = render(GraphLog, { props });
        expect(container.querySelector("circle")?.getAttribute("cy")).toBe("16");
        expect(container.querySelector("path")?.getAttribute("d")).toBe("M9,20.5 L9,43.5");
        await rerender({ ...props, rowHeight: 60, authorSpace: 20 });
        expect(container.querySelector("circle")?.getAttribute("cy")).toBe("20");
        expect(container.querySelector("path")?.getAttribute("d")).toBe("M9,24.5 L9,75.5");
        expect(container.querySelector('foreignObject[y="24.5"]')?.getAttribute("height")).toBe("51");
        expect(container.querySelector("g:nth-child(2)")?.getAttribute("transform")).toContain("60");
        await rerender({ ...props, rowHeight: 44 });
        expect(container.querySelector("circle")?.getAttribute("cy")).toBe("22");
        expect(container.querySelector("path")?.getAttribute("d")).toBe("M9,26.5 L9,61.5");
        await rerender(props);
        expect(container.querySelector("path")?.getAttribute("d")).toBe("M9,20.5 L9,43.5");
    });
    it.each(["FromNode", "ToNode", "ToIntersection"] as const)("updates %s curves and drop zones without remounting", async type => {
        let { default: GraphLine } = await import("./GraphLine.svelte");
        let line: EnhancedLine = { key: 1, type, source: [0, 0], target: [1, 2], indirect: false, parent: header, child: header };
        let { container, rerender } = render(GraphLine, { props: { line, rowHeight: 32 } });
        let path = container.querySelector("path")!;
        let previous = path.getAttribute("d");
        await rerender({ line, rowHeight: 60, authorSpace: 20 });
        expect(container.querySelector("path")).toBe(path);
        expect(path.getAttribute("d")).not.toBe(previous);
        expect(path.getAttribute("d")).toContain("M9,24.5");
        expect(path.getAttribute("d")).toContain("L27,135.5");
        let bounds = () => [...container.querySelectorAll("foreignObject")].map(element => ["x", "y", "width", "height"].map(attribute => element.getAttribute(attribute)));
        let zones = bounds();
        await rerender({ line: { ...line, target: [2, 3] }, rowHeight: 60, authorSpace: 20 });
        expect(path.getAttribute("d")).toContain("L45,195.5");
        expect(bounds()).not.toEqual(zones);
    });
    it.each([false, true])("keeps enlarged text, graph geometry and reading anchor aligned (tall=%s)", async tall => {
        let { default: GraphLog } = await import("./GraphLog.svelte");
        let { default: RevisionObject } = await import("./objects/RevisionObject.svelte");
        let base = tall ? 60 : 28;
        let line: EnhancedLine = { key: 1, type: "FromNode", source: [0, 0], target: [0, 1], indirect: false, parent: header, child: header };
        let rows: EnhancedRow[] = [0, 1].map(row => ({ revision: header, location: [0, row], padding: 0, lines: [], passingLines: [line] }));
        let { container } = render(GraphLog, { props: { rows, rowHeight: base * 2, authorSpace: tall ? 40 : 0, containerHeight: 300, containerWidth: 760, scrollTop: 0 } });
        let center = tall ? 40 : 28;
        expect(container.querySelector("circle")?.getAttribute("cy")).toBe(String(center));
        expect(container.querySelector("path")?.getAttribute("d")).toBe(`M9,${center + 4.5} L9,${base * 2 + center - 4.5}`);
        expect(anchoredHistoryScroll(10.5 * base, base, base * 2) / (base * 2)).toBe(10.5);
        let target = document.createElement("div");
        target.id = "shell";
        target.style.cssText = "width:760px;--leftpad:24px;--type-ui:26px;--type-caption:24px;--type-code:24px";
        document.body.append(target);
        let revision = render(RevisionObject, { target, props: { header, selected: false, tall, rowHeight: base * 2, textScale: 2 } });
        let row = target.querySelector(".layout")!.getBoundingClientRect();
        for (let selector of tall ? [".desc", ".author"] : [".desc"]) {
            let text = target.querySelector(selector)!.getBoundingClientRect();
            expect(text.top).toBeGreaterThanOrEqual(row.top);
            expect(text.bottom).toBeLessThanOrEqual(row.bottom);
        }
        if (tall) expect(target.querySelector(".desc")!.getBoundingClientRect().bottom).toBeLessThan(target.querySelector(".author")!.getBoundingClientRect().top);
        revision.unmount(); target.remove();
    });
    it("keeps tall authors quiet and emphasizes only the selected description", async () => {
        let { default: RevisionObject } = await import("./objects/RevisionObject.svelte");
        let { container, queryByText, rerender } = render(RevisionObject, { props: { header, selected: false, rowHeight: 32 } });
        expect(queryByText("Test Author")).toBeNull();
        await rerender({ header, selected: false, rowHeight: 60, tall: true });
        let author = queryByText("Test Author")!;
        expect(getComputedStyle(author).fontWeight).toBe("400");
        expect(getComputedStyle(container.querySelector(".layout")!).height).toBe("60px");
        expect(getComputedStyle(container.querySelector(".desc")!).fontWeight).toBe("400");
        await rerender({ header, selected: true, rowHeight: 60, tall: true });
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
    it("offers authors, change ids and commit ids in one display menu and saves them", async () => {
        let { default: TimelineDisplayOptions } = await import("./timeline/TimelineDisplayOptions.svelte");
        let { timelineIds } = await import("./timeline/display");
        let { getByRole } = render(TimelineDisplayOptions);
        let trigger = getByRole("button", { name: "Timeline display" });
        expect(trigger.getAttribute("aria-haspopup")).toBe("menu");
        await fireEvent.click(trigger);
        let authors = getByRole("menuitemcheckbox", { name: "Authors" });
        expect(authors.getAttribute("aria-checked")).toBe("false");
        expect(getByRole("menuitemcheckbox", { name: "Change IDs" }).getAttribute("aria-checked")).toBe("true");
        expect(getByRole("menuitemcheckbox", { name: "Commit IDs" }).getAttribute("aria-checked")).toBe("false");
        await fireEvent.click(authors);
        await fireEvent.click(getByRole("menuitemcheckbox", { name: "Commit IDs" }));
        expect(get(historyDensity)).toBe("tall");
        expect(localStorage.getItem(historyDensityKey)).toBe("tall");
        expect(get(timelineIds)).toEqual({ change: true, commit: true });
        expect(JSON.parse(localStorage.getItem("gg.timeline.ids")!)).toEqual({ change: true, commit: true });
        expect(getByRole("menuitemcheckbox", { name: "Commit IDs" }).getAttribute("aria-checked")).toBe("true");
    });
});
