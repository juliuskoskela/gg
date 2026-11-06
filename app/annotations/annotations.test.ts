import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, waitFor } from "@testing-library/svelte";
import { cleanupMocks, setupMocks } from "../mocks";
import type { RevHeader } from "../messages/RevHeader";
import type { RevChange } from "../messages/RevChange";
import type { AnnotationList } from "../messages/AnnotationList";
import type { AnnotationThread } from "../messages/AnnotationThread";
import { anchorFor, anchorLabel, linesAnchor } from "./anchors";
import "../global.css";

let id = { change: { type: "ChangeId" as const, hex: "wnpusytqzosxwnpusytqzosxwnpusytq", prefix: "w", rest: "", offset: null, is_divergent: false }, commit: { type: "CommitId" as const, hex: "025843422c8f5374a4160fe79195b92d6ec3c6ee", prefix: "0", rest: "" } };
let header: RevHeader = { id, description: { lines: ["rename c.txt\n"] }, refs: [], parent_ids: [], is_immutable: true, is_working_copy: false, has_conflict: false, working_copy_of: null, author: { name: "Test", email: "", timestamp: "" } };
let change: RevChange = {
    kind: "Modified", has_conflict: false, path: { repo_path: "src/a.ts", relative_path: { type: "DisplayPath", relative_path: "src/a.ts" } as any },
    hunks: [{ location: { from_file: { start: 10, len: 3 }, to_file: { start: 10, len: 3 } }, lines: { lines: [" keep\n", "-old\n", "+new\n", " tail\n"] } }],
};

function thread(overrides: Partial<AnnotationThread> = {}): AnnotationThread {
    return {
        id: "3f2a91c0aaaa", anchor: { kind: "revision", change_id: id.change.hex, commit_id: id.commit.hex }, subject: "rename c.txt", workspace: "default",
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(), status: "open", state: { type: "current" },
        posts: [{ id: "p1", author: { name: "Ada", kind: "human" }, created_at: new Date().toISOString(), body: "Why **this**?" }],
        ...overrides,
    };
}

describe("annotation anchors", () => {
    it("points at revisions, bookmarks, files and hunks with full ids", () => {
        expect(anchorFor({ type: "Revision", header })).toEqual({ anchor: { kind: "revision", change_id: id.change.hex, commit_id: id.commit.hex }, subject: "rename c.txt" });
        let remote = anchorFor({ type: "Ref", header, ref: { type: "RemoteBookmark", bookmark_name: "main", remote_name: "origin", has_conflict: false, is_synced: true, is_tracked: true, is_absent: false } });
        expect(remote?.anchor).toMatchObject({ kind: "bookmark", name: "main", remote: "origin" });
        expect(anchorFor({ type: "Change", headers: [header], path: change.path, hunk: null })?.anchor).toMatchObject({ kind: "file", path: "src/a.ts" });
        expect(anchorFor({ type: "Change", headers: [header, header], path: change.path, hunk: null })).toBeNull();
        let hunk = anchorFor({ type: "Change", headers: [header], path: change.path, hunk: change.hunks[0] })?.anchor;
        expect(hunk).toMatchObject({ kind: "lines", side: "new", start: 10, end: 12, quote: "keep\nnew\ntail" });
        expect(anchorLabel(hunk!)).toBe("src/a.ts:10–12");
    });

    it("quotes selected lines from the patch, or from the whole file outside it", async () => {
        let removed = await linesAnchor(header, change, "deletions", 11, 11);
        expect(removed).toMatchObject({ side: "old", start: 11, end: 11, quote: "old" });
        let full = vi.fn(async () => ({ before: "", after: Array.from({ length: 20 }, (_, i) => `line ${i + 1}`).join("\n") }));
        let outside = await linesAnchor(header, change, "additions", 2, 3, full);
        expect(full).toHaveBeenCalled();
        expect(outside.kind === "lines" && outside.quote).toBe("line 2\nline 3");
    });
});

describe("annotation markdown", () => {
    it("renders formatting but nothing that runs, loads or navigates away unsafely", async () => {
        let { default: Markdown } = await import("./Markdown.svelte");
        let { container } = render(Markdown, { props: { source: "**bold** <script>window.bad = 1</script><img src=x onerror=\"window.bad=1\">\n\n[run](javascript:alert(1)) [site](https://example.com)" } });
        expect(container.querySelector("strong")?.textContent).toBe("bold");
        expect(container.querySelector("script, img")).toBeNull();
        let links = [...container.querySelectorAll("a")];
        expect(links[0].hasAttribute("href")).toBe(false);
        expect(links[1].getAttribute("href")).toBe("https://example.com");
        expect(links[1].getAttribute("rel")).toContain("noopener");
        expect((window as any).bad).toBeUndefined();
    });
});

describe("annotations view", () => {
    let calls: { cmd: string; args: any }[];
    let list: AnnotationList;
    beforeEach(() => {
        calls = [];
        list = { location: "/data/gg/repos/abc", threads: [thread(), thread({ id: "8cabc639bbbb", status: "open", posts: [...thread().posts, { id: "p2", author: { name: "claude", kind: "agent" }, created_at: new Date().toISOString(), body: "Because." }] })] };
        setupMocks((cmd, args) => {
            calls.push({ cmd, args });
            if (cmd === "annotations") return list;
            if (cmd === "export_annotations") return "## Note";
        });
    });
    afterEach(async () => cleanupMocks());

    it("copies several notes for a conversation and replies in place", async () => {
        let writeText = vi.fn(async () => {});
        Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
        let { default: Panel } = await import("./AnnotationsPanel.svelte");
        let view = render(Panel, { props: { active: true } });
        await waitFor(() => expect(view.getByRole("list", { name: "Notes" }).querySelectorAll("li")).toHaveLength(2));
        await fireEvent.click(view.getByRole("list", { name: "Notes" }).querySelectorAll("li button")[1]);
        await waitFor(() => expect(view.getByText("Agent")).toBeTruthy());

        await fireEvent.click(view.getByRole("checkbox", { name: "Select all" }));
        await fireEvent.click(view.getByRole("button", { name: "Copy 2" }));
        await waitFor(() => expect(writeText).toHaveBeenCalledWith("## Note"));
        expect(calls.find(call => call.cmd === "export_annotations")?.args.ids).toEqual(["3f2a91c0aaaa", "8cabc639bbbb"]);

        let reply = view.getByRole("textbox", { name: "Reply" });
        await fireEvent.input(reply, { target: { value: "Thanks" } });
        await fireEvent.click(view.getByRole("button", { name: "Reply" }));
        await waitFor(() => expect(calls.some(call => call.cmd === "annotations" && call.args.request.type === "Reply" && call.args.request.body === "Thanks")).toBe(true));
    });

    it("explains how to start when there are no notes", async () => {
        list = { location: "/data", threads: [] };
        let { default: Panel } = await import("./AnnotationsPanel.svelte");
        let view = render(Panel, { props: { active: true } });
        await waitFor(() => expect(view.getByText("No notes yet")).toBeTruthy());
        expect(view.getByText(/Right-click a change/)).toBeTruthy();
    });
});

describe("annotation commands", () => {
    beforeEach(() => setupMocks());
    afterEach(async () => cleanupMocks());

    it("offer annotating in the context menu, even for immutable revisions", async () => {
        let { default: ContextMenu } = await import("../controls/ContextMenu.svelte");
        let view = render(ContextMenu, { props: { operand: { type: "Revision", header }, x: 10, y: 10, onClose: () => {} } });
        expect(view.getByRole("menuitem", { name: "Annotate change…" })).toBeTruthy();
    });
});
