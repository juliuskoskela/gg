import { query, type Query } from "../ipc";
import type { RevSet } from "../messages/RevSet";
import type { RevChange } from "../messages/RevChange";
import type { RevsResult } from "../messages/RevsResult";
import type { RevisionSummaryResult } from "../messages/RevisionSummaryResult";
import type { RevisionDiffResult } from "../messages/RevisionDiffResult";

export type RevisionDetail = Extract<RevsResult, { type: "Detail" }> & { summaryOnly?: boolean };
type Ready<T> = Exclude<Query<T>, { type: "wait" }>;
let diffs = new Map<string, Promise<Ready<RevChange | null>>>();

export function revisionIdentity(revs: RevisionDetail, repository: string): string {
    return JSON.stringify([repository, revs.set.from.commit.hex, revs.set.to.commit.hex]);
}

export async function loadRevisionSummary(set: RevSet): Promise<Ready<RevsResult>> {
    let result = await query<RevisionSummaryResult>("query_revision_summary", { set });
    if (result.type === "error") return result;
    if (result.value.type === "NotFound") return { type: "data", value: result.value };
    let summary = result.value;
    let changes: RevChange[] = summary.changes.map(change => ({ ...change, hunks: [] }));
    for (let path of summary.conflicts) {
        if (!changes.some(change => change.path.repo_path === path.repo_path)) changes.push({ kind: "None", path, has_conflict: true, hunks: [] });
    }
    let detail: RevisionDetail = { ...summary, changes, conflicts: [], summaryOnly: true };
    return { type: "data", value: detail };
}

export function clearRevisionDiffCache() { diffs.clear(); }

export function loadRevisionDiff(revs: RevisionDetail, file: RevChange, repository: string, fullContext = false): Promise<Ready<RevChange | null>> {
    if (!revs.summaryOnly && !fullContext) return Promise.resolve({ type: "data", value: file });
    let key = JSON.stringify([revisionIdentity(revs, repository), file.path.repo_path, fullContext]);
    let pending = diffs.get(key);
    if (pending) return pending;
    pending = query<RevisionDiffResult>("query_revision_diff", { set: revs.set, path: file.path, fullContext }).then(result => {
        if (result.type === "error") { diffs.delete(key); return result; }
        if (result.value.type === "NotFound") { diffs.delete(key); return { type: "data" as const, value: null }; }
        let { change, conflict } = result.value;
        return { type: "data" as const, value: change ?? (conflict ? { kind: "None" as const, path: conflict.path, has_conflict: true, hunks: [conflict.hunk] } : null) };
    });
    diffs.set(key, pending);
    while (diffs.size > 24) diffs.delete(diffs.keys().next().value!);
    return pending;
}
