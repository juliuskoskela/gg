import { get } from "svelte/store";
import { getInput, mutate, query } from "../ipc";
import { mutationPending } from "../operations";
import { currentInput, currentMutation, repoConfigEvent, repoStatusEvent, revisionSelectEvent } from "../stores";
import type { RevId } from "../messages/RevId";
import type { RevisionSummaryResult } from "../messages/RevisionSummaryResult";
import type { OperationPage } from "../messages/OperationPage";
import type { SplitOutcome } from "../messages/SplitOutcome";

/** Core-owned confirmation; plugins only request it, never choose mutation arguments. */
export async function requestSplit(source: RevId, validate?: () => void): Promise<SplitOutcome | null> {
    if (get(currentInput) || get(currentMutation) || get(mutationPending)) return null;
    let config = get(repoConfigEvent);
    let status = get(repoStatusEvent);
    let selection = get(revisionSelectEvent);
    let valid = () => {
        try { validate?.(); } catch { return false; }
        return get(repoConfigEvent) === config && get(repoStatusEvent) === status && get(revisionSelectEvent) === selection && !get(currentMutation) && !get(mutationPending);
    };
    if (!valid() || config.type !== "Workspace") return null;
    let summary = await query<RevisionSummaryResult>("query_revision_summary", { set: { from: source, to: source } });
    if (!valid()) return null;
    if (summary.type !== "data" || summary.value.type !== "Detail" || summary.value.headers.length !== 1) return null;
    let header = summary.value.headers[0];
    if (header.id.commit.hex !== source.commit.hex || header.id.change.hex !== source.change.hex || header.is_immutable || header.has_conflict || summary.value.changes.length < 2) {
        await getInput("Cannot split this change", "Choose a mutable, conflict-free change with at least two changed files.", []);
        return null;
    }
    let operations = await query<OperationPage>("query_operation_history", { head: null, offset: 0 });
    if (!valid() || operations.type !== "data") return null;
    if (get(currentInput)) return null;
    let paths = summary.value.changes.map(change => change.path.repo_path);
    // prefix labels so repository paths cannot collide with description fields.
    let fields = await getInput("Split change", "Select whole files for the first change. The remaining files become its child. Edit the titles before confirming; existing description bodies are preserved.", [
        ...paths.map(path => ({ label: `File: ${path}`, choices: ["false", "true"] })),
        { label: "First title", choices: [header.description.lines[0] ?? ""] },
        { label: "Remaining title", choices: [header.description.lines[0] ?? ""] },
    ]);
    if (!fields || !valid()) return null;
    let selected = paths.filter(path => fields[`File: ${path}`] === "true");
    if (!selected.length || selected.length === paths.length) {
        await getInput("Choose a smaller selection", "Select at least one file and leave at least one file in the remaining change.", []);
        return null;
    }
    if (get(currentInput)) return null;
    let confirmed = await getInput("Confirm split", `${selected.length} ${selected.length === 1 ? "file stays" : "files stay"} on ${source.change.hex.slice(0, 8)}; ${paths.length - selected.length} ${paths.length - selected.length === 1 ? "file moves" : "files move"} to a new child. Descendants and any working copy on this change move to the child. File reviews keep their original basis; whole-change approval must be renewed.`, [{ label: "Action", choices: ["Cancel", "Split"] }]);
    if (confirmed?.Action !== "Split" || !valid()) return null;
    let outcome: SplitOutcome | null = null;
    await mutate("split_revision", {
        source, operation_id: operations.value.head_id, paths: selected,
        selected_description: [fields["First title"], ...header.description.lines.slice(1)].join("\n"), remainder_description: [fields["Remaining title"], ...header.description.lines.slice(1)].join("\n"),
    }, { operation: "Split change", ignoreImmutable: false, onSplit: value => outcome = value });
    return outcome;
}
