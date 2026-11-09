import type { ReviewEvent } from "./model";
import { project, revision } from "./model";
import type { ReviewSnapshotV2 } from "./snapshot";
import type { LegacyReviewSnapshot } from "./legacySnapshot";
export function snapshotFixture(): ReviewSnapshotV2 {
    let me = { name: "Reviewer", email: "reviewer@example.com" }, member = { changeId: "abc", commitId: "123", description: "Captured change" };
    let event: ReviewEvent = { id: "created", at: "2026-11-01T00:00:00Z", type: "created", session: { id: "session", title: "Portable review", createdAt: "2026-11-01T00:00:00Z", author: me, participants: [me], members: [member] } };
    let id = revision(member);
    return {
        format: "gg.review", version: 2, id: "snapshot", capturedAt: "2026-11-01T01:00:00Z", events: [event], session: project([event])[0],
        members: [{ member, state: "captured", detail: { type: "Detail", set: { from: id, to: id }, headers: [{ id, description: { lines: ["Captured change"] }, author: { ...me, timestamp: event.at }, has_conflict: false, is_working_copy: false, working_copy_of: null, is_immutable: false, refs: [], parent_ids: [] }], parents: [], changes: [{ kind: "Modified", path: { repo_path: "file.txt", relative_path: "file.txt" }, has_conflict: false, hunks: [{ location: { from_file: { start: 1, len: 1 }, to_file: { start: 1, len: 1 } }, lines: { lines: ["-old\n", "+new\n"] } }] }], conflicts: [] } }],
        notes: { format: "gg.annotation-bundle", version: 1, threads: [] }, capturedNotes: { location: "saved", me: { name: "Reviewer", kind: "human" }, threads: [] },
        capturedMarks: { location: "saved", me, changes: [{ change_id: "abc", commit_id: "123", reviewed_commit_id: "123", state: "reviewed", total: 1, reviewed: 1, files: [{ path: "file.txt", reviewed_commit_id: "123", reviewed_at: event.at, state: "reviewed" }] }] },
    };
}
export function legacyFixture(): LegacyReviewSnapshot {
    let snapshot = snapshotFixture(), member = snapshot.members[0];
    if (member.state !== "captured") throw new Error("missing fixture");
    return { format: "gg.review", version: 1, id: "legacy", title: "Legacy portable review", repository: "example", author: { id: "person", name: "Original reviewer" }, createdAt: snapshot.capturedAt, completedAt: null, subject: { kind: "revision", change: "abc", commit: "123" }, snapshot: { from: member.detail.set.from, to: member.detail.set.to, members: [{ change: "abc", commit: "123", description: "Original change" }], files: [{ id: "file", change: member.detail.changes[0] }] }, threads: [{ id: "thread", anchor: { kind: "line", file: "file", side: "additions", start: 1, end: 1, quote: "new\n" }, posts: [{ id: "post", author: { id: "person", name: "Original reviewer" }, at: snapshot.capturedAt, body: "Legacy note" }], events: [] }], seen: [{ id: "seen", author: { id: "person", name: "Original reviewer" }, at: snapshot.capturedAt, file: "file", seen: true }] };
}
