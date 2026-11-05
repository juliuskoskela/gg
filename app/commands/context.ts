import { get, writable } from "svelte/store";
import { query } from "../ipc";
import { repoConfigEvent, repoStatusEvent } from "../stores";
import type { Operand } from "../messages/Operand";
import type { RevHeader } from "../messages/RevHeader";

// Selection owners update this when the user chooses a file, hunk, bookmark or workspace.
export let commandOperand = writable<Operand | null>(null);
export let destinationCandidates = writable<RevHeader[]>([]);
export function setCommandOperand(operand: Operand | null) { commandOperand.set(operand); }
export function setDestinationCandidates(headers: RevHeader[]) { destinationCandidates.set(headers); }

export type WorkspaceIdentity = { type: "checking" } | { type: "unavailable" } | { type: "known"; name: string };
export let currentWorkspaceIdentity = writable<WorkspaceIdentity>({ type: "checking" });
let identityRequest = 0;

// The current workspace name must come from the worker; a revision header only names other workspaces.
export async function refreshCurrentWorkspaceIdentity() {
    let request = ++identityRequest;
    let config = get(repoConfigEvent), status = get(repoStatusEvent);
    currentWorkspaceIdentity.set({ type: "checking" });
    if (config.type !== "Workspace" || !status) { currentWorkspaceIdentity.set({ type: "unavailable" }); return; }
    let result = await query<string | null>("query_workspace_identity", null);
    if (request !== identityRequest || get(repoConfigEvent) !== config || get(repoStatusEvent) !== status) return;
    currentWorkspaceIdentity.set(result.type === "data" && result.value ? { type: "known", name: result.value } : { type: "unavailable" });
}
