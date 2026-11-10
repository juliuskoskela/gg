import "../global.css";
import "../display/palettes.css";
import { page } from "vitest/browser";
import { beforeAll } from "vitest";
beforeAll(async () => { await page.viewport(1280, 720); });
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/svelte";
import { userEvent } from "vitest/browser";
import { createRawSnippet } from "svelte";
import { cleanupMocks, setupMocks } from "../mocks";
import type { HistoryRevision } from "../messages/HistoryRevision";
import RevisionLines from "./RevisionLines.svelte";
import SectionHeading from "../controls/SectionHeading.svelte";
import MetadataList from "../controls/MetadataList.svelte";
import MetadataRow from "../controls/MetadataRow.svelte";
import RefLine from "./RefLine.svelte";
import { mountShell } from "../controls/test/shell";

beforeEach(() => setupMocks());
afterEach(async () => { cleanup(); await cleanupMocks(); });

let ids = (change: string, commit: string) => ({
    change: { type: "ChangeId" as const, hex: change, prefix: change.slice(0, 2), rest: change.slice(2), offset: null, is_divergent: false },
    commit: { type: "CommitId" as const, hex: commit, prefix: commit.slice(0, 2), rest: commit.slice(2) },
});
let author = { name: "A", email: "", timestamp: "2026-11-05T14:30:00Z" };
let long = "A very long description that must be truncated with an ellipsis instead of wrapping onto a second line of the revision graph";
let revisions: HistoryRevision[] = [
    { id: ids("mzylkloupvzx", "a1b2c3d4e5f6a7b8"), description: { lines: ["Merge"] }, author, parent_ids: ["b2c3d4e5f6a7b8c9", "c3d4e5f6a7b8c9d0"], has_conflict: false },
    { id: ids("qpvuntsmwlqt", "b2c3d4e5f6a7b8c9"), description: { lines: [long, "second line"] }, author, parent_ids: ["d4e5f6a7b8c9d0e1"], has_conflict: true },
    { id: ids("kkmpptxzrspx", "c3d4e5f6a7b8c9d0"), description: { lines: [""] }, author, parent_ids: ["d4e5f6a7b8c9d0e1"], has_conflict: false },
    { id: ids("rlvkpntzqxmw", "d4e5f6a7b8c9d0e1"), description: { lines: ["Root"] }, author, parent_ids: [], has_conflict: false },
];

describe("revision lines", () => {
    it("draws every revision on one line of the same height", () => {
        let host = mountShell(360);
        let { container } = render(RevisionLines, { target: host, props: { revisions, heads: ["a1b2c3d4e5f6a7b8"], onSelect: () => {} } });
        let rowHeight = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--file-row-height")) || 0;
        let rows = [...container.querySelectorAll<HTMLElement>(".revision-row")];
        expect(rows.length).toBe(4);
        let heights = rows.map(row => row.getBoundingClientRect().height);
        expect(new Set(heights).size).toBe(1);
        expect(heights[0]).toBeGreaterThanOrEqual(24);
        if (rowHeight) expect(heights[0]).toBe(rowHeight);
        for (let button of container.querySelectorAll<HTMLElement>("button")) {
            let box = button.getBoundingClientRect();
            expect(box.height).toBe(heights[0]);
            // nothing wraps: every child sits inside the single line
            for (let child of button.children) {
                let inner = child.getBoundingClientRect();
                expect(inner.top).toBeGreaterThanOrEqual(box.top - 1);
                expect(inner.bottom).toBeLessThanOrEqual(box.bottom + 1);
            }
        }
        let subject = rows[1].querySelector<HTMLElement>(".subject")!;
        expect(subject.scrollWidth).toBeGreaterThan(subject.clientWidth);
        expect(getComputedStyle(subject).textOverflow).toBe("ellipsis");
        expect(rows[2].querySelector(".subject")!.textContent).toBe("(no description set)");
        expect(rows[2].querySelector(".subject")!.classList.contains("empty")).toBe(true);
        expect(rows[1].querySelector("[aria-label='Has conflicts']")).not.toBeNull();
        expect(rows[0].querySelector("[aria-label='Has conflicts']")).toBeNull();
        // the commit id sits at the trailing edge
        let commit = rows[0].querySelector(".commit")!.getBoundingClientRect(), box = rows[0].getBoundingClientRect();
        expect(Math.abs(box.right - commit.right - 8)).toBeLessThan(1);
    });

    it("colours nodes by lane, faintly at rest and fully when selected, with larger heads", async () => {
        let { container, rerender } = render(RevisionLines, { target: mountShell(), props: { revisions, heads: ["a1b2c3d4e5f6a7b8"], onSelect: () => {} } });
        let nodes = [...container.querySelectorAll<HTMLElement>(".node")];
        expect(nodes.length).toBe(4);
        expect(nodes[0].getBoundingClientRect().width).toBe(7);
        expect(nodes[1].getBoundingClientRect().width).toBe(6);
        expect(nodes[0].style.getPropertyValue("--lane")).toBe("var(--lane-0)");
        expect(nodes[2].style.getPropertyValue("--lane")).toMatch(/var\(--lane-[1-7]\)/);
        let probe = (value: string) => { let node = document.createElement("span"); node.style.color = value; container.append(node); return getComputedStyle(node).color; };
        expect(getComputedStyle(nodes[1]).backgroundColor).toBe(probe("color-mix(in srgb, var(--lane-0) 55%, var(--muted))"));
        await rerender({ revisions, heads: [], selected: "b2c3d4e5f6a7b8c9", onSelect: () => {} });
        expect(getComputedStyle(nodes[1]).backgroundColor).toBe(probe("var(--lane-0)"));
        let wire = container.querySelector("path")!;
        expect(getComputedStyle(wire).stroke).toBe(probe("var(--graph-edge)"));
        expect(getComputedStyle(wire).strokeWidth).toBe("1px");
    });

    it("selects on click with aria-pressed and moves focus with the arrow keys", async () => {
        let onSelect = vi.fn();
        let { container, getAllByRole } = render(RevisionLines, { target: mountShell(), props: { revisions, selected: "d4e5f6a7b8c9d0e1", onSelect } });
        let buttons = getAllByRole("button");
        expect(buttons.map(button => button.getAttribute("aria-pressed"))).toEqual(["false", "false", "false", "true"]);
        buttons[0].focus();
        await userEvent.keyboard("{ArrowDown}");
        expect(document.activeElement).toBe(buttons[1]);
        await userEvent.keyboard("{End}");
        expect(document.activeElement).toBe(buttons[3]);
        await userEvent.keyboard("{Home}");
        expect(document.activeElement).toBe(buttons[0]);
        expect(onSelect).not.toHaveBeenCalled();
        await userEvent.click(buttons[2]);
        expect(onSelect).toHaveBeenCalledWith(revisions[2]);
        expect(container.querySelectorAll("button").length).toBe(4);
    });
});

describe("detail pane alignment", () => {
    it("shares one left edge between headings, metadata labels, reference lines and revision rows", () => {
        let host = mountShell(480);
        host.style.padding = "0 var(--panel-inset)";
        let mount = () => host.appendChild(document.createElement("div"));
        render(SectionHeading, { target: mount(), props: { title: "Working copies", count: 1 } });
        render(MetadataList, { target: mount(), props: { children: createRawSnippet(() => ({ render: () => `<div><dt>Operation</dt><dd>abc</dd></div>` })) } });
        let list = mount(); list.setAttribute("role", "list");
        render(RefLine, { target: list, props: { kind: "workspace", name: "default", ids: ["a1b2c3d4e5f6"] } });
        render(RevisionLines, { target: mount(), props: { revisions, onSelect: () => {} } });
        let left = (selector: string) => host.querySelector<HTMLElement>(selector)!.getBoundingClientRect().left;
        let edge = host.getBoundingClientRect().left + parseFloat(getComputedStyle(host).paddingLeft);
        expect(left("h3")).toBe(edge);
        expect(left("dt")).toBe(edge);
        expect(left(".ref-line")).toBe(edge);
        expect(left(".revision-row")).toBe(edge);
        // the section heading's trailing gap and the following list sit a group apart
        let heading = host.querySelector(".section-heading")!.getBoundingClientRect();
        let group = parseFloat(getComputedStyle(host.querySelector(".section-heading")!).marginBottom);
        expect(group).toBe(12);
        expect(heading.height).toBeGreaterThan(0);
    });
});
