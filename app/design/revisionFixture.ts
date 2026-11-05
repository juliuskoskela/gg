import type { RevHeader } from "../messages/RevHeader";
import type { RevsResult } from "../messages/RevsResult";

let id = (change: string, commit: string) => ({
    change: { type: "ChangeId" as const, hex: change, prefix: change.slice(0, 4), rest: change.slice(4), offset: null, is_divergent: false },
    commit: { type: "CommitId" as const, hex: commit, prefix: commit.slice(0, 8), rest: commit.slice(8) },
});
let parent: RevHeader = {
    id: id("mzylkloup", "a1b2c3d4e5f6"),
    description: { lines: ["Keep repository context while reviewing a revision"] },
    author: { name: "Julius Koskela", email: "julius@example.com", timestamp: "2026-11-05T14:30:00Z" },
    has_conflict: false, is_working_copy: false, working_copy_of: null, is_immutable: true, refs: [], parent_ids: [],
};
let header: RevHeader = {
    ...parent,
    id: id("tksquloy", "c8074ec511bb1234567890"),
    description: { lines: ["Keep revision descriptions readable at every panel size", "", "Show the change first, followed by its authorship, references and parents.", "", "Long bookmark names and release tags wrap in the same value column as the rest of the metadata."] },
    author: { ...parent.author, name: "Julius Koskela (Digimuoto Oy)" },
    refs: [
        { type: "LocalBookmark", bookmark_name: "ui/readable-revision-descriptions", has_conflict: false, is_synced: true, tracking_remotes: ["origin"], available_remotes: 1, potential_remotes: 1 },
        { type: "RemoteBookmark", bookmark_name: "ui/readable-revision-descriptions", remote_name: "origin", has_conflict: false, is_synced: true, is_tracked: true, is_absent: false },
        { type: "LocalBookmark", bookmark_name: "review/description-metadata-layout-with-an-intentionally-long-reference-name", has_conflict: false, is_synced: false, tracking_remotes: [], available_remotes: 0, potential_remotes: 1 },
        { type: "Tag", tag_name: "v0.46.0" },
        { type: "Tag", tag_name: "release/description-layout-preview-with-additional-metadata" },
    ],
    parent_ids: [parent.id.commit],
};
export let revisionFixture: Extract<RevsResult, { type: "Detail" }> = { type: "Detail", set: { from: header.id, to: header.id }, headers: [header], parents: [parent], changes: [], conflicts: [] };
