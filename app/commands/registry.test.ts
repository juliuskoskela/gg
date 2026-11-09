import { get } from "svelte/store";
import { commandOperand } from "./context";
import type { Operand } from "../messages/Operand";
import { destinationRequest } from "./destination";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanupMocks, setupMocks } from "../mocks";
import type { RevHeader } from "../messages/RevHeader";
import { contextCommands, revisionCommands, revisionLabel, undoLabel } from "./registry";
import BinaryMutator from "../mutators/BinaryMutator";
import { operationState } from "../operations";
import { currentInput, currentMutation, ignoreToggled, pickedRevisions, repoConfigEvent, revisionSelectEvent } from "../stores";

let id = { change: { type: "ChangeId" as const, hex: "abcdefghijk", prefix: "a", rest: "bcdefghijk", offset: null, is_divergent: false }, commit: { type: "CommitId" as const, hex: "0123456789abcdef", prefix: "0", rest: "123456789abcdef" } };
let header: RevHeader = { id, description: { lines: ["Fix parser", "details"] }, refs: [{ type: "LocalBookmark", bookmark_name: "main", has_conflict: false, is_synced: false, tracking_remotes: [], available_remotes: 0, potential_remotes: 0 }], parent_ids: [id.commit], is_immutable: false, is_working_copy: false, has_conflict: false, working_copy_of: null, author: { name: "Test", email: "test@example.com", timestamp: "" } };

describe("command guards and labels", () => {
    let calls: string[];
    beforeEach(() => { calls = []; pickedRevisions.set([]); setupMocks(cmd => { calls.push(cmd); return { type: "Unchanged" }; }); currentMutation.set(null); currentInput.set(null); commandOperand.set(null); operationState.set(null); ignoreToggled.set(false); revisionSelectEvent.set({ from: id, to: id }); });
    afterEach(async () => cleanupMocks());
    it("identifies both revisions and compacts operation labels", () => {
        expect(revisionLabel(header)).toBe("Fix parser · abcdefgh / 01234567 · main");
        expect(undoLabel("undo: restore to operation 0123456789abcdef")).toBe("Undo earlier operation");
        expect(undoLabel("rebase 0123456789abcdef")).toBe("Undo: rebase 01234567");
    });
    it("rechecks a selection that became stale before executing", () => {
        let command = revisionCommands([header]).find(c => c.id === "abandon")!;
        revisionSelectEvent.set(undefined);
        command.execute();
        expect(calls).toEqual([]);
        expect(revisionCommands([header]).find(c => c.id === "abandon")?.reason).toBe("Selection has changed");
    });
    it("rechecks immutable protection before execution", () => {
        ignoreToggled.set(true);
        let immutable = { ...header, is_immutable: true };
        let command = revisionCommands([immutable]).find(c => c.id === "abandon")!;
        ignoreToggled.set(false);
        command.execute();
        expect(calls).toEqual([]);
        expect(revisionCommands([immutable]).find(c => c.id === "abandon")?.reason).toBe("Immutable revisions are protected");
    });
    it("rejects a separately constructed operand for the same commit", async () => {
        let source = { type: "Revision" as const, header };
        let destination = { type: "Revision" as const, header: { ...header, id: { ...header.id } } };
        let mutator = new BinaryMutator(source, destination, false);
        expect(mutator.canDrop().type).toBe("no");
        expect(await mutator.doDrop()).toBe(false);
        expect(calls).toEqual([]);
    });
    it("exposes bookmark and workspace commands with specific unavailable reasons", () => {
        let operand = { type: "Ref" as const, header, ref: header.refs[0] };
        let commands = contextCommands(operand);
        expect(commands.find(c => c.id === "context-track")?.reason).toBe("Select a remote bookmark");
        expect(commands.find(c => c.id === "context-push-single")?.reason).toBe("No eligible remotes");
        expect(contextCommands({ type: "Workspace", name: "other" }).map(c => c.id)).toEqual(["context-open", "context-rename", "context-forget"]);
    });
    it("blocks execution while the immediate operation lock is held", () => {
        let command = revisionCommands([header]).find(c => c.id === "abandon")!;
        operationState.set({ id: 1, phase: "pending", label: "Working" });
        command.execute();
        expect(calls).toEqual([]);
        expect(revisionCommands([header]).find(c => c.id === "abandon")?.reason).toBe("Another operation is in progress");
        operationState.set(null);
    });
    it("cancels the destination picker without mutating", async () => {
        let pending = revisionCommands([header]).find(c => c.id === "move")!.execute();
        let request = get(destinationRequest)!;
        expect(request).toBeTruthy();
        destinationRequest.set(null); request.resolve(null);
        await pending;
        expect(calls).toEqual([]);
    });
    it("does not resolve a destination after the selection changes", async () => {
        let pending = revisionCommands([header]).find(c => c.id === "move")!.execute();
        let request = get(destinationRequest)!;
        revisionSelectEvent.set(undefined);
        destinationRequest.set(null); request.resolve("main");
        await pending;
        expect(calls).toEqual([]);
    });
    it("blocks external resolution of immutable revisions even when override is enabled", () => {
        repoConfigEvent.set({ type: "Workspace", absolute_path: "/fixture", git_remotes: [], query_choices: {}, latest_query: "@", theme_override: null, status: { operation_description: "", working_copy: id.commit, can_redo: false }, mark_unpushed_bookmarks: false, track_recent_workspaces: false, ignore_immutable: false, has_external_diff_tool: true, has_external_merge_tool: true });
        ignoreToggled.set(true);
        let operand = { type: "Change" as const, headers: [{ ...header, is_immutable: true }], path: { repo_path: "file.txt", relative_path: "file.txt" }, hunk: null };
        let command = contextCommands(operand).find(c => c.id === "context-external_resolve")!;
        expect(command.reason).toBe("Revision is immutable");
        command.execute();
        expect(calls).toEqual([]);
    });
    function destination(commit: string, immutable = false): RevHeader {
        return { ...header, id: { ...id, change: { ...id.change, hex: `change-${commit}` }, commit: { ...id.commit, hex: commit } }, is_immutable: immutable };
    }
    async function choose(header: RevHeader) {
        setupMocks(cmd => { if (cmd.startsWith("plugin:")) return; calls.push(cmd); return cmd === "query_revisions" ? { type: "Detail", headers: [header] } : { type: "Unchanged" }; });
        let request = get(destinationRequest)!;
        expect(request).toBeTruthy();
        destinationRequest.set(null);
        request.resolve(header.id.commit.hex);
        await vi.waitFor(() => expect(get(currentInput)).not.toBeNull());
    }
    it.each(["before", "after"])("rejects a fresh insertion %s endpoint matching the source commit", async endpoint => {
        let source = { type: "Revision" as const, header };
        let other = destination("other");
        let same = structuredClone(header);
        let target: Operand = { type: "Parent", header: endpoint === "after" ? same : other, child: endpoint === "before" ? same : other };
        let mutator = new BinaryMutator(source, target, false);
        expect(mutator.canDrop().type).toBe("no");
        expect(await mutator.doDrop()).toBe(false);
        expect(calls).toEqual([]);
    });
    it("rejects insertion source overlap before opening confirmation", async () => {
        let after = structuredClone(header);
        let before = { ...destination("child"), parent_ids: [id.commit] };
        let responses = [after, before];
        setupMocks(cmd => { if (cmd.startsWith("plugin:")) return; calls.push(cmd); return { type: "Detail", headers: [responses.shift()!] }; });
        let pending = revisionCommands([header]).find(c => c.id === "insert")!.execute();
        let first = get(destinationRequest)!; destinationRequest.set(null); first.resolve("after");
        await vi.waitFor(() => expect(get(destinationRequest)).not.toBeNull());
        let second = get(destinationRequest)!; destinationRequest.set(null); second.resolve("before");
        await vi.waitFor(() => expect(get(currentInput)?.title).toBe("Action unavailable"));
        get(currentInput)!.callback(null);
        await pending;
        expect(calls).toEqual(["query_revisions", "query_revisions"]);
    });
    it("invalidates a merge-parent review when protection changes and changes back", async () => {
        ignoreToggled.set(true);
        let pending = revisionCommands([header]).find(c => c.id === "add_parent")!.execute();
        await choose(destination("immutable-destination", true));
        expect(get(currentInput)?.title).toBe("Review revision change");
        ignoreToggled.set(false); ignoreToggled.set(true);
        get(currentInput)!.callback({ fields: { Action: "Apply" } });
        await pending;
        expect(calls).toEqual(["query_revisions"]);
    });
    it("invalidates a file move review when immutable protection is restored", async () => {
        ignoreToggled.set(true);
        let operand: Operand = { type: "Change", headers: [header], path: { repo_path: "file.txt", relative_path: "file.txt" }, hunk: null };
        let pending = contextCommands(operand).find(c => c.id === "context-move_to")!.execute();
        await choose(destination("other"));
        expect(get(currentInput)?.title).toBe("Review move");
        ignoreToggled.set(false);
        get(currentInput)!.callback({ fields: { Action: "Move" } });
        await pending;
        expect(calls).toEqual(["query_revisions"]);
    });
    it("invalidates a null command context when a new operand appears during review", async () => {
        let operand: Operand = { type: "Change", headers: [header], path: { repo_path: "file.txt", relative_path: "file.txt" }, hunk: null };
        let pending = contextCommands(operand).find(c => c.id === "context-copy_to")!.execute();
        await choose(destination("other"));
        expect(get(currentInput)?.title).toBe("Review restore");
        commandOperand.set(operand);
        get(currentInput)!.callback({ fields: { Action: "Restore" } });
        await pending;
        expect(calls).toEqual(["query_revisions"]);
    });
    it("disables arbitrary hunk restore while retaining file restore", async () => {
        let operand: Operand = { type: "Change", headers: [header], path: { repo_path: "file.txt", relative_path: "file.txt" }, hunk: { location: { from_file: { start: 2, len: 1 }, to_file: { start: 9, len: 3 } }, lines: { lines: ["+new"] } } };
        let command = contextCommands(operand).find(c => c.id === "context-copy_to")!;
        expect(command.reason).toBe("Restoring a hunk into another revision is not supported");
        await command.execute();
        expect(get(destinationRequest)).toBeNull();
        expect(calls).toEqual([]);
        expect(contextCommands({ ...operand, hunk: null }).find(c => c.id === "context-copy_to")?.reason).toBeNull();
    });

    it("still restores file contents after an unchanged review", async () => {
        let operand: Operand = { type: "Change", headers: [header], path: { repo_path: "file.txt", relative_path: "file.txt" }, hunk: null };
        let pending = contextCommands(operand).find(c => c.id === "context-copy_to")!.execute();
        await choose(destination("other"));
        get(currentInput)!.callback({ fields: { Action: "Restore" } });
        await pending;
        expect(calls).toEqual(["query_revisions", "copy_changes"]);
    });

    function scatter() {
        let headers = [header, destination("second")];
        pickedRevisions.set(headers);
        revisionSelectEvent.set({ from: headers[1].id, to: headers[1].id });
        return headers;
    }
    it("offers only exact abandon and independent rebase for a scattered selection", () => {
        let commands = revisionCommands(scatter());
        expect(commands.find(command => command.id === "move")?.label).toBe("Rebase each onto…");
        expect(commands.find(command => command.id === "abandon")?.reason).toBeNull();
        expect(commands.find(command => command.id === "move")?.reason).toBeNull();
        expect(commands.find(command => command.id === "squash")?.reason).toContain("continuous range");
    });
    it("abandons precisely the confirmed picks without building a range", async () => {
        let headers = scatter(); let sent: unknown;
        setupMocks((cmd, args) => { if (cmd.startsWith("plugin:")) return; calls.push(cmd); sent = args.mutation; return { type: "Unchanged" }; });
        let pending = revisionCommands(headers).find(command => command.id === "abandon")!.execute();
        expect(get(currentInput)?.detail).toContain("2 selected changes");
        expect(get(currentInput)?.detail).toContain("unselected descendants remain");
        get(currentInput)!.callback({ fields: { Action: "Abandon selected" } });
        await pending;
        expect(calls).toEqual(["abandon_selected_revisions"]);
        expect(sent).toEqual({ ids: headers.map(header => header.id) });
    });
    it("cancels a reviewed scattered action when picks change", async () => {
        let headers = scatter();
        let pending = revisionCommands(headers).find(command => command.id === "abandon")!.execute();
        pickedRevisions.set([header]);
        get(currentInput)!.callback({ fields: { Action: "Abandon selected" } });
        await pending;
        expect(calls).toEqual([]);
    });
    it("does not reinterpret a stale scattered menu as a continuous range", async () => {
        let command = revisionCommands(scatter(), false).find(command => command.id === "abandon")!;
        pickedRevisions.set([]);
        await command.execute();
        expect(get(currentInput)).toBeNull();
        expect(calls).toEqual([]);
    });
    it("rebases precisely the confirmed picks onto one exact destination", async () => {
        let headers = scatter(); let target = destination("target"); let sent: unknown;
        setupMocks((cmd, args) => { if (cmd.startsWith("plugin:")) return; calls.push(cmd); if (cmd === "query_revisions") return { type: "Detail", headers: [target] }; sent = args.mutation; return { type: "Unchanged" }; });
        let pending = revisionCommands(headers).find(command => command.id === "move")!.execute();
        let request = get(destinationRequest)!; destinationRequest.set(null); request.resolve("target");
        await vi.waitFor(() => expect(get(currentInput)).not.toBeNull());
        expect(get(currentInput)?.detail).toContain("separate child");
        get(currentInput)!.callback({ fields: { Action: "Rebase each" } });
        await pending;
        expect(calls).toEqual(["query_revisions", "rebase_selected_revisions"]);
        expect(sent).toEqual({ ids: headers.map(header => header.id), destination: target.id });
    });

});
