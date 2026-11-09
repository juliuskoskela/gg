import { afterEach, beforeEach, expect, it } from "vitest";
import { fireEvent, render } from "@testing-library/svelte";
import { cleanupMocks, setupMocks } from "../mocks";
import type { RevChange } from "../messages/RevChange";
import RevisionFiles from "./RevisionFiles.svelte";
import DiffStat from "./DiffStat.svelte";

beforeEach(() => setupMocks());
afterEach(() => cleanupMocks());

let files: RevChange[] = [
    { kind: "Added", category: "Test", path: { repo_path: "spec/test.rs", relative_path: "spec/test.rs" }, has_conflict: false, hunks: [], stat: { added: 10, removed: 0 } },
    { kind: "Modified", category: "Implementation", path: { repo_path: "src/main.rs", relative_path: "src/main.rs" }, has_conflict: false, hunks: [], stat: { added: 2, removed: 1 } },
];

it("groups by category without hiding tests and keeps file selection", async () => {
    let selected = "";
    let view = render(RevisionFiles, { changes: files, headers: [], selectedPath: "", reviewKey: "categories", visible: true, overlay: false, onSelect: file => selected = file.path.repo_path });
    await fireEvent.click(view.getByRole("button", { name: "Group by type" }));
    expect(view.getByRole("heading", { name: "Tests 1" })).toBeTruthy();
    expect(view.getByRole("heading", { name: "Implementation 1" })).toBeTruthy();
    await fireEvent.click(view.getByRole("option", { name: "spec/test.rs" }));
    expect(selected).toBe("spec/test.rs");
});

it("counts implementation by default and exposes the full total", () => {
    let view = render(DiffStat, { changes: files });
    let counts = view.getByLabelText("Implementation: 2 additions, 1 deletions. All files: 12 additions, 1 deletions");
    expect(counts.textContent).toBe("+2−1*");
    expect(counts.title).toContain("All files: 12 additions");
});

it("retains test-only files and their totals", () => {
    let view = render(RevisionFiles, { changes: [files[0]], headers: [], selectedPath: "", reviewKey: "tests-only", visible: true, overlay: false, onSelect: () => {} });
    expect(view.getByRole("option", { name: "spec/test.rs" })).toBeTruthy();
});
