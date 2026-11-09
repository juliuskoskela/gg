import type { RevChange } from "../../messages/RevChange";
import type { RevId } from "../../messages/RevId";
import * as check from "./snapshotValidation";

export interface LegacyPerson { id: string; name: string; }
export type LegacySubject = { kind: "revision"; commit: string; change: string } | { kind: "change"; change: string; observedCommit: string } | { kind: "revset"; expression: string; commits: string[] };
export type LegacyAnchor = LegacySubject | { kind: "line"; file: string; side: "additions" | "deletions"; start: number; end: number; quote: string };
export interface LegacyReviewSnapshot {
    format: "gg.review"; version: 1; id: string; title: string; repository: string; author: LegacyPerson; createdAt: string; completedAt: string | null; subject: LegacySubject;
    snapshot: { from: RevId; to: RevId; members: { change: string; commit: string; description: string }[]; files: { id: string; change: RevChange }[] };
    threads: { id: string; anchor: LegacyAnchor; posts: { id: string; author: LegacyPerson; at: string; body: string }[]; events: { id: string; author: LegacyPerson; at: string; status: "open" | "resolved" | "obsolete" }[] }[];
    seen: { id: string; author: LegacyPerson; at: string; file: string; seen: boolean }[];
}
function subject(value: unknown, commits: Set<unknown>) {
    let item = check.object(value);
    check.requireValue(["revision", "change", "revset"].includes(String(item.kind)));
    if (item.kind === "revset") { check.text(item.expression); let ids = check.array(item.commits, 500); check.requireValue(ids.length > 0 && ids.every(id => commits.has(id))); }
    else { check.text(item.change, 256, true); check.requireValue(commits.has(item.kind === "revision" ? item.commit : item.observedCommit)); }
}
export function validateLegacy(value: unknown): asserts value is LegacyReviewSnapshot {
    let item = check.object(value), snapshot = check.object(item.snapshot);
    check.text(item.id, 300, true); check.text(item.title, 240, true); check.text(item.repository, 4096, true); check.person(item.author, true); check.time(item.createdAt); if (item.completedAt !== null) check.time(item.completedAt);
    check.revisionId(snapshot.from); check.revisionId(snapshot.to);
    let members = check.array(snapshot.members, 500); check.requireValue(members.length > 0); check.unique(members, "commit");
    for (let raw of members) { let member = check.object(raw); check.text(member.change, 256, true); check.text(member.commit, 256, true); check.text(member.description); }
    let commits = new Set(members.map(raw => check.object(raw).commit)); subject(item.subject, commits);
    check.requireValue(commits.has(check.object(check.object(snapshot.from).commit).hex) && commits.has(check.object(check.object(snapshot.to).commit).hex));
    let files = check.array(snapshot.files, 500); check.unique(files);
    let byId = new Map<string, RevChange>();
    for (let raw of files) { let file = check.object(raw); check.text(file.id, 300, true); check.change(file.change); byId.set(file.id, file.change); }
    let threads = check.array(item.threads, 2000); check.unique(threads);
    for (let raw of threads) {
        let thread = check.object(raw), anchor = check.object(thread.anchor); check.text(thread.id, 300, true);
        if (anchor.kind === "line") {
            check.text(anchor.file, 300, true); check.requireValue(byId.has(anchor.file)); check.requireValue(anchor.side === "additions" || anchor.side === "deletions"); check.integer(anchor.start, 1); check.integer(anchor.end, anchor.start); check.requireValue(anchor.end - anchor.start < 500); check.text(anchor.quote, 32 * 1024 * 1024);
            let lines = new Map<number, string>();
            for (let hunk of byId.get(anchor.file)!.hunks) {
                let line = anchor.side === "additions" ? hunk.location.to_file.start : hunk.location.from_file.start;
                for (let text of hunk.lines.lines) { if (text.startsWith("\\") || text.startsWith(anchor.side === "additions" ? "-" : "+")) continue; if (line >= anchor.start && line <= anchor.end) lines.set(line, text.slice(1)); line++; }
            }
            check.requireValue(lines.size === anchor.end - anchor.start + 1 && [...lines.values()].join("") === anchor.quote, "Legacy comment does not match its captured source");
        } else subject(anchor, commits);
        let posts = check.array(thread.posts, 2000); check.requireValue(posts.length > 0); check.unique(posts);
        for (let raw of posts) { let post = check.object(raw); check.text(post.id, 300, true); check.person(post.author, true); check.time(post.at); check.text(post.body, 20_000, true); }
        let events = check.array(thread.events, 2000); check.unique(events);
        for (let raw of events) { let event = check.object(raw); check.text(event.id, 300, true); check.person(event.author, true); check.time(event.at); check.requireValue(["open", "resolved", "obsolete"].includes(String(event.status))); }
    }
    let seen = check.array(item.seen, 20_000); check.unique(seen);
    for (let raw of seen) { let event = check.object(raw); check.text(event.id, 300, true); check.person(event.author, true); check.time(event.at); check.requireValue(byId.has(String(event.file)) && typeof event.seen === "boolean"); }
}
