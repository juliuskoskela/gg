import { derived, writable } from "svelte/store";

export type OperationState = { id: number; label: string; phase: "pending" | "succeeded" | "failed" | "cancelled"; detail?: string };
export let operationState = writable<OperationState | null>(null);
export let mutationPending = derived(operationState, state => state?.phase === "pending");

export function operationLabel(command: string): string {
    let labels: Record<string, string> = {
        describe_revisions: "Update description", edit_revision: "Edit working copy",
        move_revisions: "Move revisions", insert_revisions: "Insert revisions",
        move_changes: "Move file changes", copy_changes: "Restore file contents",
        move_hunk: "Move hunk", copy_hunk: "Restore hunk",
        undo_operation: "Undo operation", redo_operation: "Redo operation",
        abandon_selected_revisions: "Abandon selected changes", rebase_selected_revisions: "Rebase each selected change",
        abandon_revisions: "Abandon revisions", duplicate_revisions: "Duplicate revisions",
        git_fetch: "Fetch bookmarks", git_push: "Push bookmarks",
    };
    let label = labels[command] ?? command.replaceAll("_", " ");
    return label.charAt(0).toUpperCase() + label.slice(1);
}
