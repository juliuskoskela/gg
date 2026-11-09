import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/svelte";
import { get } from "svelte/store";
import { effectiveAnchor } from "./anchors";
import { annotationList, openNotesByChange } from "./store";
import type { AnnotationTarget } from "../messages/AnnotationTarget";
import ChangeObject from "../objects/ChangeObject.svelte";
import type { RevHeader } from "../messages/RevHeader";
import TargetList from "./TargetList.svelte";

let owner = {
    change: { type: "ChangeId" as const, hex: "new-owner", prefix: "new", rest: "-owner", offset: null, is_divergent: false },
    commit: { type: "CommitId" as const, hex: "new-commit", prefix: "new", rest: "-commit" },
};
let target: AnnotationTarget = {
    anchor: { kind: "file", path: "src/file.rs", change_id: "original", commit_id: "original-commit" },
    subject: "Original change", state: { type: "rewritten", commit_id: "new-commit" },
    relocation: { owner, receipts: ["split-receipt"], reason: null },
};
afterEach(() => { cleanup(); annotationList.set(null); });

describe("annotation split ownership", () => {
    it("shows the current owner explicitly while retaining original provenance", () => {
        let resolved = effectiveAnchor(target);
        expect(resolved.change_id).toBe("new-owner");
        expect(target.anchor.change_id).toBe("original");
        let ui = render(TargetList, { props: { targets: [target] } });
        expect(ui.getByText("Moved by split")).toBeInTheDocument();
        expect(ui.getByText("Moved by split").getAttribute("title")).toContain("original-com");
        expect(ui.getByText("new-")).toBeInTheDocument();
    });

    it("counts open notes on their verified owner", () => {
        annotationList.set({ location: "local", me: { name: "Reviewer", kind: "human" }, threads: [{
            id: "note", targets: [target], workspace: "default", created_at: "now", updated_at: "now", status: "open",
            posts: [{ id: "post", author: { name: "Reviewer", kind: "human" }, created_at: "now", body: "Question" }],
        }] });
        expect(get(openNotesByChange).get("new-owner")).toHaveLength(1);
        expect(get(openNotesByChange).has("original")).toBe(false);
        let header: RevHeader = { id: owner, description: { lines: ["Split remainder"] }, refs: [], parent_ids: [], is_immutable: false, is_working_copy: true, has_conflict: false, working_copy_of: "default", author: { name: "Reviewer", email: "review@example.com", timestamp: "" } };
        let ui = render(ChangeObject, { props: { headers: [header], selected: false, change: { kind: "Added", path: { repo_path: "src/file.rs", relative_path: "src/file.rs" }, hunks: [], has_conflict: false } } });
        expect(ui.getByText(", 1 note")).toBeInTheDocument();
    });

    it("keeps unresolved whole-change ownership visible", () => {
        let unresolved: AnnotationTarget = { ...target, relocation: { owner: null, receipts: ["split"], reason: "Choose which part this note belongs to." } };
        let ui = render(TargetList, { props: { targets: [unresolved] } });
        expect(effectiveAnchor(unresolved)).toBe(target.anchor);
        expect(ui.getByRole("img", { name: "Choose which part this note belongs to." })).toBeInTheDocument();
        expect(ui.queryByText("Moved by split")).not.toBeInTheDocument();
    });
});
