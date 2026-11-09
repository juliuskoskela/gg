import { query } from "../ipc";
import { pickedRevisions, revisionSelectEvent } from "../stores";
import { workspaceController } from "../workspace/state";
import { dock } from "../workspace/dock";
import type { RevId } from "../messages/RevId";
import type { RevisionSelectionResult } from "../messages/RevisionSelectionResult";

export async function selectRevision(id: RevId, path: string | undefined, validate: () => void) {
    if (path && (path.startsWith("/") || path.split("/").includes(".."))) throw new Error("File path must be relative to the repository");
    let result = await query<RevisionSelectionResult>("resolve_revision_selection", { id });
    validate();
    if (result.type === "error") throw new Error(result.message);
    let candidates = result.value.candidates;
    let selected = candidates.find(header => header.id.commit.hex === id.commit.hex) ?? (candidates.length === 1 ? candidates[0] : undefined);
    if (!selected) throw new Error(candidates.length ? "Choose a current revision of this divergent change" : "This change is unavailable");
    let set = { from: selected.id, to: selected.id };
    pickedRevisions.set([]);
    workspaceController.selectRevision(set);
    if (path) workspaceController.setFile(path);
    revisionSelectEvent.set(set);
    dock.open("diff");
}
