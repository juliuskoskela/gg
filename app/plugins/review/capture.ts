import { loadRevisionDiff, loadRevisionSummary, type RevisionDetail } from "../../revision/data";
import { createReview, MAX_BYTES, type Person, type Subject } from "./model";
import type { RevChange } from "../../messages/RevChange";

export async function captureReview(detail: RevisionDetail, title: string, repository: string, author: Person, kind: Subject["kind"], progress: (label: string) => void) {
    let files = [...detail.changes, ...detail.conflicts.filter(conflict => !detail.changes.some(c => c.path.repo_path === conflict.path.repo_path)).map(conflict => ({ kind: "None" as const, path: conflict.path, has_conflict: true, hunks: [conflict.hunk] }))];
    if (files.length > 500 || detail.headers.length > 500) throw new Error("This candidate supports up to 500 files and revisions per review. Select a smaller range.");
    let captured: RevChange[] = [];
    let bytes = 0;
    for (let [index, file] of files.entries()) {
        progress(`Capturing ${index + 1} of ${files.length} files…`);
        let result = await loadRevisionDiff(detail, file, `review-capture:${crypto.randomUUID()}`);
        if (result.type !== "data" || !result.value) throw new Error(result.type === "error" ? result.message : `Couldn’t capture ${file.path.relative_path}. Refresh the selection and retry.`);
        bytes += new TextEncoder().encode(JSON.stringify(result.value)).length;
        if (bytes > MAX_BYTES * 0.8) throw new Error("This patch is too large for a portable review. Select a smaller range (limit 10 MB).");
        captured.push(result.value);
    }
    let checked = await loadRevisionSummary(detail.set);
    if (checked.type !== "data" || checked.value.type !== "Detail" || JSON.stringify(checked.value.headers.map(h => h.id.commit.hex)) !== JSON.stringify(detail.headers.map(h => h.id.commit.hex))) throw new Error("The selected revisions changed while capturing. Refresh the selection and retry.");
    let label = repository.split(/[\\/]/).filter(Boolean).at(-1) || "Repository";
    return createReview(detail, captured, title, label, author, kind);
}
