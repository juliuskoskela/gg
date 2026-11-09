import { afterEach, beforeEach, expect, it } from "vitest";
import { fireEvent, render, waitFor } from "@testing-library/svelte";
import { get } from "svelte/store";
import { cleanupMocks, setupMocks } from "../mocks";
import type { ReviewProgress } from "../messages/ReviewProgress";
import type { RevHeader } from "../messages/RevHeader";
import type { RepoConfig } from "../messages/RepoConfig";
import "../global.css";

let header: RevHeader = {
    id: { change: { type: "ChangeId", hex: "change", prefix: "c", rest: "hange", offset: null, is_divergent: false }, commit: { type: "CommitId", hex: "current", prefix: "c", rest: "urrent" } },
    description: { lines: ["Change"] }, refs: [], parent_ids: [], is_immutable: false, is_working_copy: true, has_conflict: false, working_copy_of: null,
    author: { name: "Author", email: "author@example.test", timestamp: "" },
};
let list: ReviewProgress;
let calls: { cmd: string; args: Record<string, unknown> }[];
let pending: Promise<ReviewProgress> | null;

beforeEach(() => {
    calls = [];
    pending = null;
    list = { me: { name: "Me", email: "me@example.test" }, location: "/data/reviews", changes: [] };
    setupMocks((cmd, args) => {
        if (cmd !== "review_progress") return;
        calls.push({ cmd, args });
        return pending ?? list;
    });
});
afterEach(async () => { await cleanupMocks(); });

async function context(path = "/repo") {
    let { repoConfigEvent } = await import("../stores");
    repoConfigEvent.set({ type: "Workspace", absolute_path: path } as RepoConfig);
    return repoConfigEvent;
}

it("marks only the explicitly selected file, using server identity, and displays changed state", async () => {
    await context();
    let progress = await import("./progress");
    list.changes = [{ change_id: "change", commit_id: "current", reviewed_commit_id: null, state: "changed", total: 1, reviewed: 0,
        files: [{ path: "src/a.ts", reviewed_commit_id: "old", reviewed_at: "2026-11-09T00:00:00Z", state: "changed" }] }];
    await progress.refreshReviewProgress();
    let { default: Control } = await import("./ReviewControl.svelte");
    let { default: Badge } = await import("./FileReviewBadge.svelte");
    let view = render(Control, { header, path: "src/a.ts" });
    let badge = render(Badge, { header, path: "src/a.ts" });
    expect(badge.getByRole("img", { name: "Changed since your review" })).toBeTruthy();
    await fireEvent.click(view.getByRole("button", { name: "Mark file as reviewed" }));
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1].args).toEqual({ request: { type: "Set", id: header.id, path: "src/a.ts", reviewed: true } });
});

it("clears personal state immediately on repository switch and ignores the old reply", async () => {
    let config = await context();
    let progress = await import("./progress");
    let release!: (value: ReviewProgress) => void;
    pending = new Promise(resolve => { release = resolve; });
    let loading = progress.refreshReviewProgress();
    await waitFor(() => expect(calls).toHaveLength(1));
    config.set({ type: "Workspace", absolute_path: "/another" } as RepoConfig);
    let { repositoryScope } = await import("../workspace/repository");
    progress.resetReviewProgress(repositoryScope(get(config)));
    release(list);
    expect(await loading).toBe(false);
    expect(get(progress.reviewProgress)).toBeNull();
});

it("background reads cannot replace a pending explicit mark", async () => {
    await context();
    let progress = await import("./progress");
    let release!: (value: ReviewProgress) => void;
    pending = new Promise(resolve => { release = resolve; });
    let marking = progress.setReviewed(header, null, true);
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(await progress.refreshReviewProgress()).toBe(false);
    expect(calls).toHaveLength(1);
    release(list);
    expect(await marking).toBe(true);
    expect(get(progress.reviewBusy)).toBe(false);
});

it("the exact previously reviewed commit stays checked when viewed historically", async () => {
    let progress = await import("./progress");
    list.changes = [{ change_id: "change", commit_id: "newer", reviewed_commit_id: "current", state: "changed", total: 1, reviewed: 0,
        files: [{ path: "src/a.ts", reviewed_commit_id: "current", reviewed_at: "2026-11-09T00:00:00Z", state: "gone" }] }];
    expect(progress.fileReviewState(header, "src/a.ts", list)).toBe("reviewed");
    expect(progress.fileReviewState({ ...header, id: { ...header.id, commit: { ...header.id.commit, hex: "unrelated" } } }, "src/a.ts", list)).toBeNull();
});
