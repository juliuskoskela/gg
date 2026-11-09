import { get } from "svelte/store";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setupMocks, cleanupMocks } from "../mocks";
import { currentInput, currentMutation, repoConfigEvent, repoStatusEvent, revisionSelectEvent } from "../stores";
import { operationState } from "../operations";
import { requestSplit } from "./requestSplit";
import type { RevHeader } from "../messages/RevHeader";

let id = { change: { type: "ChangeId" as const, hex: "abcdefghijkl", prefix: "a", rest: "bcdefghijkl", offset: null, is_divergent: false }, commit: { type: "CommitId" as const, hex: "0123456789abcdef", prefix: "0", rest: "123456789abcdef" } };
let header: RevHeader = { id, description: { lines: ["Original"] }, refs: [], parent_ids: [], is_immutable: false, is_working_copy: true, has_conflict: false, working_copy_of: "default", author: { name: "Test", email: "test@example.com", timestamp: "" } };
let status = { working_copy: id.commit, operation_description: "Original", can_redo: false };
let outcome = { receipt_id: "receipt", source: id, selected: id, remainder: { ...id, change: { ...id.change, hex: "mnopqrstuvwx" } }, operation_id: "after", ownership: [{ path: "first.txt", owner: "selected" }, { path: "second.txt", owner: "remainder" }] };

describe("core split confirmation", () => {
    let calls: Array<{ command: string; args: any }>;
    beforeEach(() => {
        calls = [];
        setupMocks((command, args) => {
            if (command.startsWith("plugin:")) return;
            calls.push({ command, args });
            if (command === "query_revision_summary") return { type: "Detail", headers: [header], parents: [], changes: ["first.txt", "second.txt"].map(path => ({ path: { repo_path: path, relative_path: path } })), conflicts: [] };
            if (command === "query_operation_history") return { head_id: "before", entries: [], has_more: false };
            if (command === "split_revision") return { type: "Split", new_status: status, new_selection: { ...header, id: outcome.remainder }, outcome };
        });
        operationState.set(null); currentMutation.set(null); currentInput.set(null); repoStatusEvent.set(status); revisionSelectEvent.set({ from: id, to: id });
        repoConfigEvent.set({ type: "Workspace", absolute_path: "/repo", git_remotes: [], query_choices: {}, latest_query: "@", status, theme_override: null, mark_unpushed_bookmarks: false, track_recent_workspaces: false, ignore_immutable: false, has_external_diff_tool: false, has_external_merge_tool: false });
    });
    afterEach(cleanupMocks);
    async function choose() {
        await vi.waitFor(() => expect(get(currentInput)?.title).toBe("Split change"));
        get(currentInput)!.callback({ fields: { "File: first.txt": "true", "File: second.txt": "false", "First title": "First", "Remaining title": "Second" } });
        await vi.waitFor(() => expect(get(currentInput)?.title).toBe("Confirm split"));
    }
    it("requires a separate confirmation then returns the exact typed receipt", async () => {
        let pending = requestSplit(id); await choose();
        expect(calls.map(call => call.command)).toEqual(["query_revision_summary", "query_operation_history"]);
        get(currentInput)!.callback({ fields: { Action: "Split" } });
        expect(await pending).toEqual(outcome);
        expect(calls.at(-1)?.args).toEqual({ mutation: { source: id, operation_id: "before", paths: ["first.txt"], selected_description: "First", remainder_description: "Second" }, options: { ignore_immutable: false } });
        expect(get(revisionSelectEvent)?.to).toEqual(outcome.remainder);
    });
    it("cancels without mutation when selection changes during confirmation", async () => {
        let pending = requestSplit(id); await choose(); revisionSelectEvent.set(undefined);
        get(currentInput)!.callback({ fields: { Action: "Split" } });
        expect(await pending).toBeNull(); expect(calls.some(call => call.command === "split_revision")).toBe(false);
    });
    it("rechecks host permission after confirmation", async () => {
        let enabled = true;
        let pending = requestSplit(id, () => { if (!enabled) throw new Error("disabled"); });
        await choose(); enabled = false; get(currentInput)!.callback({ fields: { Action: "Split" } });
        expect(await pending).toBeNull(); expect(calls.some(call => call.command === "split_revision")).toBe(false);
    });
    it("does not replace another dialog opened while loading the source", async () => {
        let pending = requestSplit(id);
        let other = { title: "Other action", detail: "", fields: [], callback: () => {} };
        currentInput.set(other);
        expect(await pending).toBeNull();
        expect(get(currentInput)).toBe(other);
    });
    it("canceling the picker never mutates", async () => {
        let pending = requestSplit(id);
        await vi.waitFor(() => expect(get(currentInput)?.title).toBe("Split change"));
        get(currentInput)!.callback(null);
        expect(await pending).toBeNull(); expect(calls.some(call => call.command === "split_revision")).toBe(false);
    });
});
