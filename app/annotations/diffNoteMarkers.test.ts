import "../global.css";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render, waitFor } from "@testing-library/svelte";
import { userEvent } from "vitest/browser";
import { setupMocks, cleanupMocks } from "../mocks";
import type { RevChange } from "../messages/RevChange";
import type { AnnotationThread } from "../messages/AnnotationThread";
import { openAnnotation } from "./store";
import { get } from "svelte/store";
import DiffViewer from "../DiffViewer.svelte";
import { diffStyle } from "../stores";
let note: AnnotationThread = { id: "line-note", targets: [{ anchor: { kind: "lines", change_id: "change", commit_id: "commit", path: "file", side: "new", start: 1, end: 1, quote: "new" }, state: { type: "current" }, subject: "Example" }], status: "open", workspace: "default", created_at: "now", updated_at: "now", posts: [{ id: "post", created_at: "now", author: { name: "Reviewer", kind: "human" }, body: "Check this line" }] };
let change: RevChange = { kind: "Modified", path: { repo_path: "file", relative_path: "file" }, has_conflict: false, hunks: [{ location: { from_file: { start: 1, len: 1 }, to_file: { start: 1, len: 1 } }, lines: { lines: ["-old\n", "+new\n"] } }] };
beforeEach(() => { setupMocks(); diffStyle.set("split"); openAnnotation.set(null); });
afterEach(() => { cleanupMocks(); diffStyle.set("auto"); });
describe("diff gutter notes", () => {
    it("mounts an accessible marker on the correct side and opens the shared note", async () => {
        let view = render(DiffViewer, { change, noteMarkers: [{ side: "additions", line: 1, notes: [note] }] });
        await waitFor(() => expect(view.getByRole("button", { name: "Open 1 note on new line 1" })).toBeTruthy());
        let root = view.container.querySelector("diffs-container")!.shadowRoot!;
        let slot = root.querySelector('slot[data-note-marker]')!;
        expect(slot.closest("[data-additions]")).not.toBeNull();
        await userEvent.hover(view.getByRole("button", { name: "Open 1 note on new line 1" }));
        await waitFor(() => expect(view.container.querySelector(".note-preview")?.matches(":popover-open")).toBe(true));
        await userEvent.click(view.getByRole("button", { name: "Open 1 note on new line 1" }));
        expect(get(openAnnotation)).toBe("line-note");
        await view.rerender({ change, noteMarkers: [] });
        await waitFor(() => expect(view.queryByRole("button", { name: "Open 1 note on new line 1" })).toBeNull());
        expect(root.querySelector('slot[data-note-marker]')).toBeNull();
    });
    it("combines old and new context notes in one unified gutter control", async () => {
        diffStyle.set("unified");
        let context: RevChange = { ...change, hunks: [{ location: { from_file: { start: 3, len: 1 }, to_file: { start: 4, len: 1 } }, lines: { lines: [" source\n"] } }] };
        let view = render(DiffViewer, { change: context, noteMarkers: [{ side: "deletions", line: 3, contextLine: 4, notes: [note] }, { side: "additions", line: 4, notes: [{ ...note, id: "other" }] }] });
        await waitFor(() => expect(view.getByRole("button", { name: "Open 2 notes on old line 3 and new line 4" })).toBeTruthy());
        expect(view.container.querySelector("diffs-container")!.shadowRoot!.querySelectorAll("slot[data-note-marker]")).toHaveLength(1);
    });
    it("recreates markers after layout changes without placing old notes on new changed lines", async () => {
        let view = render(DiffViewer, { change, noteMarkers: [{ side: "deletions", line: 1, notes: [note] }] });
        await waitFor(() => expect(view.getByRole("button", { name: "Open 1 note on old line 1" })).toBeTruthy());
        diffStyle.set("unified");
        await waitFor(() => {
            let slot = view.container.querySelector("diffs-container")!.shadowRoot!.querySelector('slot[data-note-marker]')!;
            expect(slot.parentElement!.getAttribute("data-line-type")).toBe("change-deletion");
        });
        await waitFor(() => expect(view.getAllByRole("button", { name: "Open 1 note on old line 1" })).toHaveLength(1));
        view.unmount();
        expect(view.container.querySelector('.diff-note-marker')).toBeNull();
    });
});
