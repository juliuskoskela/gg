import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/svelte";
import type { RevId } from "../messages/RevId";
import { setupMocks, cleanupMocks } from "../mocks";

async function renderDelta(props: { from: RevId; to: RevId; path?: string }) {
    let { default: ReviewDelta } = await import("./ReviewDelta.svelte");
    return render(ReviewDelta, props);
}

let queryMock = vi.fn();
let id = (commit: string): RevId => ({
    change: { type: "ChangeId", hex: "samechange", prefix: "same", rest: "change", offset: null, is_divergent: false },
    commit: { type: "CommitId", hex: commit, prefix: commit.slice(0, 8), rest: commit.slice(8) },
});
let ready = { type: "Ready", changes: [], description_before: "same", description_after: "same", rebased: true };
afterEach(cleanupMocks);
beforeEach(() => { queryMock.mockReset(); setupMocks((command, args) => command === "query_review_delta" ? queryMock(command, args) : undefined); });

describe("review comparison", () => {
    it("distinguishes unchanged rebases from unavailable versions", async () => {
        queryMock.mockResolvedValue(ready);
        let view = await renderDelta( { from: id("oldversion"), to: id("newversion") });
        await waitFor(() => expect(view.getByText("No code changes between these versions.")).toBeTruthy());
        expect(queryMock).toHaveBeenCalledWith("query_review_delta", { request: { from: id("oldversion"), to: id("newversion"), path: null, full_context: false } });
        queryMock.mockResolvedValue({ type: "Unavailable", reason: "Version was removed." });
        await view.rerender({ from: id("removedversion"), to: id("newversion") });
        await waitFor(() => expect(view.getByText("Version was removed.")).toBeTruthy());
        expect(view.queryByText("No code changes between these versions.")).toBeNull();
    });

    it("preserves description edits even when code is unchanged", async () => {
        queryMock.mockResolvedValue({ ...ready, description_after: "Better explanation" });
        let view = await renderDelta( { from: id("oldversion"), to: id("newversion") });
        await waitFor(() => expect(view.getByText("Description changed")).toBeTruthy());
        expect(view.getByText("Better explanation")).toBeTruthy();
    });

    it("ignores a response from an earlier pair of versions", async () => {
        let finish!: (value: unknown) => void;
        queryMock.mockReturnValueOnce(new Promise(resolve => finish = resolve));
        let view = await renderDelta( { from: id("oldversion"), to: id("newversion") });
        await waitFor(() => expect(queryMock).toHaveBeenCalledOnce());
        queryMock.mockResolvedValue(ready);
        await view.rerender({ from: id("anotherold"), to: id("newversion") });
        await waitFor(() => expect(view.getByText("No code changes between these versions.")).toBeTruthy());
        finish({ type: "Unavailable", reason: "Stale response" });
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(view.queryByText("Stale response")).toBeNull();
    });

    it("shows binary or metadata-only file changes without claiming nothing changed", async () => {
        queryMock.mockResolvedValue({ ...ready, changes: [{ kind: "Modified", path: { repo_path: "icon.png", relative_path: "icon.png" }, has_conflict: false, hunks: [] }] });
        let view = await renderDelta( { from: id("oldversion"), to: id("newversion"), path: "icon.png" });
        await waitFor(() => expect(view.getByText("No text preview is available for this changed file.")).toBeTruthy());
        expect(view.getByRole("combobox", { name: "Comparison file" })).toBeTruthy();
    });
});
