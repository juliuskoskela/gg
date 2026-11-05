import { get } from "svelte/store";
import { mutationPending } from "../operations";
import { getInput, isTauri, mutate, query, trigger } from "../ipc";
import { chooseDestination } from "./destination";
import { commandOperand, currentWorkspaceIdentity, destinationCandidates } from "./context";
import type { OperationPreflight } from "../messages/OperationPreflight";
import type { Operand } from "../messages/Operand";
import type { RevHeader } from "../messages/RevHeader";
import type { RevsResult } from "../messages/RevsResult";
import type { RepoConfig } from "../messages/RepoConfig";
import { changeSelectEvent, currentMutation, ignoreToggled, repoConfigEvent, repoStatusEvent, revisionSelectEvent } from "../stores";
import BinaryMutator from "../mutators/BinaryMutator";
import RevisionMutator from "../mutators/RevisionMutator";
import RefMutator from "../mutators/RefMutator";
import { handleCommand } from "../mutators/commands";
import { revisionCapabilities } from "../mutators/revisionActions";

let protectionVersion = 0;
let trackingProtection = false;
function currentProtectionVersion() {
    // defer subscription until stores have finished their circular module initialization
    if (!trackingProtection) {
        trackingProtection = true;
        ignoreToggled.subscribe(() => protectionVersion += 1);
    }
    return protectionVersion;
}

export type Command = { id: string; label: string; icon: string; scope: string; shortcut?: string; reason: string | null; execute: () => void | Promise<void> };

export function revisionLabel(header: RevHeader): string {
    let description = header.description.lines[0]?.trim() || "(no description)";
    let refs = header.refs.filter(ref => ref.type !== "Tag").map(ref => ref.type === "RemoteBookmark" ? `${ref.bookmark_name}@${ref.remote_name}` : ref.bookmark_name);
    return `${description} · ${header.id.change.hex.slice(0, 8)} / ${header.id.commit.hex.slice(0, 8)}${refs.length ? ` · ${refs.join(", ")}` : ""}`;
}

export function undoLabel(description?: string): string {
    if (!description) return "Undo latest operation";
    if (description.toLowerCase().startsWith("undo:")) return "Undo earlier operation";
    return `Undo: ${description.replace(/\b[0-9a-f]{16,}\b/gi, hash => hash.slice(0, 8))}`;
}

function selectionCurrent(headers: RevHeader[]) {
    let selected = get(revisionSelectEvent);
    return !!selected && !!headers.length && selected.from.commit.hex === headers.at(-1)?.id.commit.hex && selected.to.commit.hex === headers[0]?.id.commit.hex;
}

export function revisionCommands(headers: RevHeader[], checkSelection = true, ..._dependencies: unknown[]): Command[] {
    let ignore = get(ignoreToggled);
    let capabilities = revisionCapabilities(headers, ignore);
    let immutable = !ignore && headers.some(h => h.is_immutable);
    let definitions: [keyof typeof capabilities | "move" | "insert" | "add_parent" | "remove_parent", string, string][] = [
        ["new_child", "New child", "plus"], ["new_parent", "New inserted parent", "plus"],
        ["edit", "Edit as working copy", "edit-2"], ["revert", "Back out into working copy", "corner-up-left"],
        ["duplicate", "Duplicate", "copy"], ["abandon", "Abandon", "trash-2"],
        ["squash", "Squash into parent", "arrow-up"], ["restore", "Restore from parent", "rotate-ccw"],
        ["bookmark", "Create bookmark…", "bookmark"], ["move", "Move revisions…", "move"], ["insert", "Insert revisions between…", "git-merge"], ["add_parent", "Add as merge parent…", "git-merge"], ["remove_parent", "Remove a parent…", "git-merge"],
    ];
    return definitions.map(([id, label, icon]) => {
        let permitted = id === "add_parent" ? headers.length > 0 : id === "move" || id === "insert" ? headers.length > 0 && !immutable : id === "remove_parent" ? headers.length === 1 && headers[0].parent_ids.length > 1 && !immutable : capabilities[id];
        let reason = (get(currentMutation) || get(mutationPending)) ? "Another operation is in progress" : !headers.length ? "Select a revision" :
            checkSelection && !selectionCurrent(headers) ? "Selection has changed" : !permitted ?
            (immutable && ["move", "insert", "add_parent", "remove_parent", "new_parent", "edit", "abandon", "squash", "restore"].includes(id) ? "Immutable revisions are protected" : "This action requires a different selection or one parent") : null;
        return { id, label, icon, scope: "Revision", reason, execute: () => {
            // Re-evaluate at invocation, including after the palette has opened.
            if (revisionCommands(headers, checkSelection).find(c => c.id === id)?.reason) return;
            let status = get(repoStatusEvent);
            let config = get(repoConfigEvent);
            let selection = get(revisionSelectEvent);
            let protection = currentProtectionVersion();
            let valid = () => protectionVersion === protection && !get(currentMutation) && !get(mutationPending) && get(repoStatusEvent) === status && get(repoConfigEvent) === config && get(revisionSelectEvent) === selection && !revisionCommands(headers, checkSelection).find(c => c.id === id)?.reason;
            if (id === "move") return moveRevisions(headers, checkSelection, valid);
            if (id === "insert" || id === "add_parent" || id === "remove_parent") return manipulateRevisions(id, headers, valid);
            new RevisionMutator(headers, get(ignoreToggled), valid).handle(id);
        } };
    });
}

async function resolveDestination(title: string, valid: () => boolean): Promise<RevHeader | null> {
    let expression = await chooseDestination(title, get(destinationCandidates));
    if (!expression || !valid()) return null;
    let id = {
        change: { type: "ChangeId" as const, hex: expression, prefix: expression, rest: "", offset: null, is_divergent: false },
        commit: { type: "CommitId" as const, hex: "", prefix: "", rest: "" },
    };
    let verified = await query<RevsResult>("query_revisions", { set: { from: id, to: id } });
    if (verified.type !== "data" || verified.value.type !== "Detail" || verified.value.headers.length !== 1) {
        await getInput("Cannot move revisions", "The destination must resolve to exactly one revision.", []);
        return null;
    }
    let destination = verified.value.headers[0];
    return destination;
}

async function moveRevisions(headers: RevHeader[], checkSelection: boolean, valid: () => boolean) {
    let destination = await resolveDestination("Move revisions to", valid);
    if (!destination || !valid()) return;
    let source: Operand = headers.length === 1 ? { type: "Revision", header: headers[0] } : { type: "Revisions", headers };
    let target: Operand = { type: "Revision", header: destination };
    let eligibility = new BinaryMutator(source, target, get(ignoreToggled)).canDrop();
    if (eligibility.type !== "yes" || revisionCommands(headers, checkSelection).find(c => c.id === "move")?.reason) {
        await getInput("Cannot move revisions", eligibility.type === "maybe" ? eligibility.hint : "The source, destination or selection is no longer valid.", []);
        return;
    }
    let sourceLabel = headers.length === 1 ? revisionLabel(headers[0]) : `${headers.length} revisions, from ${revisionLabel(headers[headers.length - 1])} through ${revisionLabel(headers[0])}`;
    let confirm = await getInput("Move revisions?", `Move ${sourceLabel} onto ${revisionLabel(destination)}. Descendants may be rewritten and conflicts may result. Type MOVE to continue.`, ["Confirmation"]);
    if (confirm?.Confirmation !== "MOVE" || !valid() || revisionCommands(headers, checkSelection).find(c => c.id === "move")?.reason) return;
    let mutator = new BinaryMutator(source, target, get(ignoreToggled));
    if (mutator.canDrop().type === "yes") mutator.doDrop();
}

async function manipulateRevisions(action: "insert" | "add_parent" | "remove_parent", headers: RevHeader[], valid: () => boolean) {
    let source: Operand = headers.length === 1 ? { type: "Revision", header: headers[0] } : { type: "Revisions", headers };
    let target: Operand;
    if (action === "remove_parent") {
        let parent = await resolveDestination("Choose parent to remove", valid);
        if (!parent || !valid() || !headers[0].parent_ids.some(id => id.hex === parent.id.commit.hex)) return;
        source = { type: "Parent", header: parent, child: headers[0] };
        target = { type: "Repository" };
    } else if (action === "add_parent") {
        let revision = await resolveDestination("Add selected revisions as parents of", valid);
        if (!revision || !valid()) return;
        if (revision.is_immutable && !get(ignoreToggled)) { await getInput("Action unavailable", "Destination revision is immutable.", []); return; }
        target = { type: "Merge", header: revision };
    } else {
        let after = await resolveDestination("Insert after", valid);
        if (!after || !valid()) return;
        let before = await resolveDestination("Insert before", valid);
        if (!before || !valid() || !before.parent_ids.some(id => id.hex === after.id.commit.hex)) return;
        target = { type: "Parent", header: after, child: before };
    }
    let mutator = new BinaryMutator(source, target, get(ignoreToggled));
    let eligibility = mutator.canDrop();
    if (eligibility.type !== "yes") { await getInput("Action unavailable", eligibility.type === "maybe" ? eligibility.hint : "These revisions cannot be used together.", []); return; }
    let details = eligibility.hint.map(part => typeof part === "string" ? part : part.type === "ChangeId" || part.type === "CommitId" ? part.hex.slice(0, 8) : part.bookmark_name).join("");
    let confirm = await getInput("Review revision change", `${details}. Descendants may be rewritten and conflicts may result.`, [{ label: "Action", choices: ["Cancel", "Apply"] }]);
    if (confirm?.Action === "Apply" && valid() && mutator.canDrop().type === "yes") mutator.doDrop();
}

export function contextCommands(operand: Operand | null | undefined, ..._dependencies: unknown[]): Command[] {
    if (!operand || (operand.type !== "Change" && operand.type !== "Ref" && operand.type !== "Workspace")) return [];
    let entries: { id: string; label: string; scope: string; reason?: string }[] = [];
    if (operand.type === "Change") {
        let parent = operand.headers.at(-1)?.parent_ids.length === 1;
        let singleHunk = !operand.hunk || operand.headers.length === 1;
        let reason = !parent ? "Requires exactly one parent" : !singleHunk ? "Select one revision for a hunk" : !get(ignoreToggled) && operand.headers.some(h => h.is_immutable) ? "Immutable revisions are protected" : undefined;
        let kind = operand.hunk ? "hunk" : "file";
        let config = get(repoConfigEvent);
        let selectedFile = get(changeSelectEvent);
        entries = [{ id: "file_history", label: "View file history", scope: "File" }, { id: "squash", label: `Squash ${kind} into parent`, scope: "File", reason }, { id: "restore", label: `Restore ${kind} from parent`, scope: "File", reason }, { id: "move_to", label: `Move ${kind} changes to…`, scope: "File", reason: !singleHunk ? "Select one revision for a hunk" : !get(ignoreToggled) && operand.headers.some(h => h.is_immutable) ? "Immutable revisions are protected" : undefined }, { id: "copy_to", label: `Restore ${kind} into revision…`, scope: "File", reason: operand.hunk ? "Restoring a hunk into another revision is not supported" : operand.headers.length !== 1 ? "Select one source revision" : undefined },
            { id: "external_diff", label: "Open in external diff tool", scope: "File", reason: config.type !== "Workspace" || !config.has_external_diff_tool ? "No external diff tool configured" : undefined },
            { id: "external_resolve", label: "Resolve in external merge tool", scope: "File", reason: config.type !== "Workspace" || !config.has_external_merge_tool ? "No external merge tool configured" : operand.headers.length !== 1 ? "Select one revision" : operand.headers[0].is_immutable ? "Revision is immutable" : selectedFile?.path.repo_path !== operand.path.repo_path || !selectedFile.has_conflict ? "Select a conflicted file" : undefined }];
    } else if (operand.type === "Ref") {
        let ref = operand.ref;
        let local = ref.type === "LocalBookmark";
        let remote = ref.type === "RemoteBookmark";
        let tag = ref.type === "Tag";
        entries = [
            { id: "track", label: "Track remote bookmark", scope: "Bookmark", reason: ref.type !== "RemoteBookmark" ? "Select a remote bookmark" : ref.is_tracked ? "Already tracked" : undefined },
            { id: "untrack", label: "Untrack bookmark", scope: "Bookmark", reason: ref.type === "LocalBookmark" ? !ref.tracking_remotes.length ? "No tracked remotes" : undefined : ref.type === "RemoteBookmark" ? (!ref.is_tracked || ref.is_synced || ref.is_absent) ? "This remote bookmark cannot be untracked" : undefined : "Tags cannot be tracked" },
            { id: "push-all", label: "Push bookmark", scope: "Bookmark", reason: ref.type === "Tag" ? "Tags cannot be pushed here" : ref.type === "LocalBookmark" ? !ref.tracking_remotes.length ? "No tracked remotes" : undefined : !(ref.is_tracked && ref.is_absent) ? "No pending remote deletion" : undefined },
            { id: "push-single", label: "Push bookmark to remote…", scope: "Bookmark", reason: ref.type !== "LocalBookmark" ? "Select a local bookmark" : !ref.potential_remotes ? "No eligible remotes" : undefined },
            { id: "fetch-all", label: "Fetch bookmark", scope: "Bookmark", reason: ref.type === "Tag" ? "Tags cannot be fetched here" : ref.type === "LocalBookmark" ? !ref.tracking_remotes.length ? "No tracked remotes" : undefined : ref.is_tracked && ref.is_absent ? "No remote bookmark to fetch" : undefined },
            { id: "fetch-single", label: "Fetch bookmark from remote…", scope: "Bookmark", reason: ref.type !== "LocalBookmark" ? "Select a local bookmark" : !ref.available_remotes ? "No available remotes" : undefined },
            { id: "rename", label: "Rename bookmark…", scope: "Bookmark", reason: !local ? "Select a local bookmark" : undefined },
            { id: "delete", label: remote ? "Forget remote bookmark" : tag ? "Delete tag" : "Delete bookmark", scope: "Bookmark", reason: ref.type === "RemoteBookmark" && ref.is_absent && ref.is_tracked ? "This remote bookmark is already absent" : undefined },
            { id: "move_to", label: "Move bookmark to…", scope: "Bookmark", reason: !local ? "Select a local bookmark" : undefined },
        ];
    } else {
        let current = get(currentWorkspaceIdentity);
        let unknown = current.type === "checking" ? "Checking current workspace" : current.type === "unavailable" ? "Cannot determine current workspace" : undefined;
        entries = [
            { id: "open", label: "Open workspace", scope: "Workspace" },
            { id: "rename", label: "Rename workspace…", scope: "Workspace", reason: unknown ?? (current.type === "known" && current.name !== operand.name ? "Only the current workspace can be renamed" : undefined) },
            { id: "forget", label: "Forget workspace", scope: "Workspace", reason: unknown ?? (current.type === "known" && current.name === operand.name ? "Cannot forget the current workspace" : undefined) },
        ];
    }
    return entries.map(entry => {
        let reason = (get(currentMutation) || get(mutationPending)) ? "Another operation is in progress" : entry.reason ?? null;
        return { id: `context-${entry.id}`, label: entry.label, scope: entry.scope, icon: "file", reason, execute: () => {
            if (contextCommands(operand).find(c => c.id === `context-${entry.id}`)?.reason) return;
            let status = get(repoStatusEvent), config = get(repoConfigEvent), selected = get(commandOperand), selection = get(revisionSelectEvent);
            let protection = currentProtectionVersion();
            let valid = () => protectionVersion === protection && !get(currentMutation) && !get(mutationPending) && get(repoStatusEvent) === status && get(repoConfigEvent) === config && get(revisionSelectEvent) === selection && get(commandOperand) === selected && !contextCommands(operand).find(c => c.id === `context-${entry.id}`)?.reason;
            if (entry.id === "move_to" || entry.id === "copy_to") return moveOperand(operand, valid, entry.id === "copy_to");
            if (operand.type === "Change" && (entry.id === "external_diff" || entry.id === "external_resolve")) { mutate(entry.id, { id: operand.headers[0].id, path: operand.path }); return; }
            handleCommand(operand, entry.id, get(ignoreToggled), valid);
        } };
    });
}

async function moveOperand(operand: Operand, valid: () => boolean, copy = false) {
    if (operand.type !== "Change" && operand.type !== "Ref") return;
    let destination = await resolveDestination(operand.type === "Ref" ? "Move bookmark to" : "Move changes to", valid);
    if (!destination || !valid()) return;
    if (copy && operand.type === "Change") {
        if (operand.hunk) return;
        if (destination.is_immutable && !get(ignoreToggled)) { await getInput("Action unavailable", "Destination revision is immutable.", []); return; }
        if (destination.id.commit.hex === operand.headers[0].id.commit.hex) return;
        let confirmation = await getInput("Review restore", `Restore file contents of ${operand.path.repo_path} from ${revisionLabel(operand.headers[0])} into ${revisionLabel(destination)}. Destination contents may be replaced.`, [{ label: "Action", choices: ["Cancel", "Restore"] }]);
        if (confirmation?.Action !== "Restore" || !valid()) return;
        await mutate("copy_changes", { from_id: operand.headers[0].id.commit, to_set: { from: destination.id, to: destination.id }, paths: [operand.path] }, { ignoreImmutable: get(ignoreToggled) });
        return;
    }
    let target: Operand = { type: "Revision", header: destination };
    let mutator = new BinaryMutator(operand, target, get(ignoreToggled));
    let eligibility = mutator.canDrop();
    if (eligibility.type !== "yes") { await getInput("Action unavailable", eligibility.type === "maybe" ? eligibility.hint : "This destination cannot be used.", []); return; }
    let name = operand.type === "Change" ? `${operand.hunk ? "hunk" : "file"} ${operand.path.repo_path}` : operand.ref.type === "Tag" ? operand.ref.tag_name : operand.ref.bookmark_name;
    let result = await getInput("Review move", `Move ${name}${operand.type === "Change" ? ` from ${operand.headers.map(revisionLabel).join(" through ")}` : ""} to ${revisionLabel(destination)}. Revisions may be rewritten and conflicts may result.`, [{ label: "Action", choices: ["Cancel", "Move"] }]);
    if (result?.Action === "Move" && valid() && mutator.canDrop().type === "yes") mutator.doDrop();
}

export function nativeRepositoryCommands(enabled = isTauri()): Command[] {
    if (!enabled) return [];
    let actions = [
        ["open", "Open repository…", "o", false, "Ctrl/⌘ O"],
        ["init", "Initialize repository…", "n", true, "Ctrl/⌘ Shift N"],
        ["clone", "Clone repository…", "o", true, "Ctrl/⌘ Shift O"],
        ["reopen", "Reopen repository", "f5", false, "F5"],
    ] as const;
    let commands: Command[] = actions.map(([id, label, key, shift, shortcut]) => ({
        id: `repository.${id}`, label, icon: "folder", scope: "Repository", shortcut, reason: null,
        execute: () => trigger("forward_accelerator", { key, ctrl: key !== "f5", shift }),
    }));
    commands.push({ id: "repository.recent", label: "Open recent workspace…", icon: "folder", scope: "Repository", reason: null, execute: async () => {
        let recent = await query<string[]>("query_recent_workspaces", null);
        if (recent.type !== "data" || !recent.value.length) { await getInput("Recent workspaces", "No recent workspaces available.", []); return; }
        let answer = await getInput("Open recent workspace", "", [{ label: "Workspace", choices: recent.value }]);
        let path = answer?.Workspace;
        if (!path || !recent.value.includes(path)) return;
        let result = await query<RepoConfig>("query_workspace", { path });
        if (result.type === "data") repoConfigEvent.set(result.value);
        else repoConfigEvent.set({ type: "LoadError", absolute_path: path, message: result.message });
    } });
    commands.push({ id: "repository.close", label: "Close window", icon: "x", scope: "Repository", reason: null,
        execute: async () => { let { getCurrentWindow } = await import("@tauri-apps/api/window"); await getCurrentWindow().close(); } });
    return commands;
}

export function repositoryCommands(remoteName = "", ..._dependencies: unknown[]): Command[] {
    let config = get(repoConfigEvent);
    let remotes = config.type === "Workspace" ? config.git_remotes : [];
    let busy = !!get(currentMutation) || get(mutationPending);
    let status = get(repoStatusEvent);
    let commands: Command[] = [
        ...nativeRepositoryCommands(),
        { id: "repository.undo", label: undoLabel(status?.operation_description), icon: "rotate-ccw", scope: "Repository", shortcut: "Ctrl/⌘ Z", reason: busy ? "Another operation is in progress" : null, execute: async () => { await executeRecovery(false); } },
        { id: "repository.redo", label: "Redo", icon: "rotate-cw", scope: "Repository", shortcut: "Ctrl/⌘ Shift Z", reason: busy ? "Another operation is in progress" : !status?.can_redo ? "Nothing to redo" : null, execute: async () => { await executeRecovery(true); } },
    ];
    commands.push(
        { id: "repository.refresh", label: "Refresh repository", icon: "refresh-cw", scope: "Repository", reason: busy ? "Another operation is in progress" : null, execute: () => { window.dispatchEvent(new Event("gg:refresh-repository")); } },
        { id: "repository.immutable", label: get(ignoreToggled) ? "Restore immutability protection" : "Override immutability protection", icon: "shield", scope: "Repository", reason: busy ? "Another operation is in progress" : null, execute: () => { if (!get(currentMutation) && !get(mutationPending)) ignoreToggled.update(value => !value); } },
    );
    for (let action of ["fetch", "push"] as const) {
        commands.push({ id: `repository.${action}`, label: action === "fetch" ? "Fetch remote bookmarks…" : "Push all bookmarks…", icon: action === "fetch" ? "arrow-down" : "arrow-up", scope: "Repository", reason: busy ? "Another operation is in progress" : !remotes.length ? "No Git remote configured" : null, execute: async () => {
            if (get(currentMutation) || get(mutationPending)) return;
            let current = get(repoConfigEvent);
            let status = get(repoStatusEvent);
            let available = current.type === "Workspace" ? current.git_remotes : [];
            let remote = available.includes(remoteName) ? remoteName : "";
            if (!remote) {
                let answer = await getInput(action === "fetch" ? "Fetch bookmarks" : "Push bookmarks", "Select the remote for all bookmarks.", [{ label: "Remote", choices: available }]);
                remote = answer?.Remote ?? "";
            }
            if (!available.includes(remote) || get(currentMutation) || get(mutationPending) || get(repoConfigEvent) !== current || get(repoStatusEvent) !== status) return;
            await mutate(`git_${action}`, { refspec: { type: "AllBookmarks", remote_name: remote }, input: null }, { operation: `${action === "fetch" ? "Fetching from" : "Pushing to"} ${remote}…` });
        } });
    }
    return commands;
}

export function executeOperandCommand(operand: Operand | null | undefined, id: string) {
    if (!operand) return;
    let commands = operand.type === "Revision" || operand.type === "Revisions"
        ? revisionCommands(operand.type === "Revision" ? [operand.header] : operand.headers, false)
        : contextCommands(operand);
    let command = commands.find(command => command.id === id || command.id === `context-${id}`);
    if (command && !command.reason) return command.execute();
}

async function executeRecovery(redo: boolean) {
    if (get(currentMutation) || get(mutationPending)) return;
    let config = get(repoConfigEvent), status = get(repoStatusEvent);
    let result = await query<OperationPreflight>("query_operation_preflight", { redo });
    if (config !== get(repoConfigEvent) || status !== get(repoStatusEvent) || get(currentMutation) || get(mutationPending)) return;
    if (result.type === "error" || !result.value.eligible) {
        await getInput(redo ? "Redo unavailable" : "Undo unavailable", result.type === "error" ? result.message : result.value.reason ?? "This operation cannot be restored.", []);
        return;
    }
    await mutate(redo ? "redo_operation" : "undo_operation", null);
}
