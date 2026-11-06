import type { RevChange } from "../../messages/RevChange";
import type { RevId } from "../../messages/RevId";
import type { RevisionDetail } from "../../revision/data";
import type { SelectedLineRange } from "@pierre/diffs";

export let MAX_BYTES = 10 * 1024 * 1024;
export type Person = { id: string; name: string };
export type Member = { change: string; commit: string; description: string };
export type Subject =
    | { kind: "revision"; commit: string; change: string }
    | { kind: "change"; change: string; observedCommit: string }
    | { kind: "revset"; expression: string; commits: string[] };
export type Anchor = Subject | { kind: "line"; file: string; side: "additions" | "deletions"; start: number; end: number; quote: string };
export type Post = { id: string; author: Person; at: string; body: string };
export type Status = "open" | "resolved" | "obsolete";
export type StatusEvent = { id: string; author: Person; at: string; status: Status };
export type Thread = { id: string; anchor: Anchor; posts: Post[]; events: StatusEvent[] };
export type SnapshotFile = { id: string; change: RevChange };
export type SeenEvent = { id: string; author: Person; at: string; file: string; seen: boolean };
export type Review = {
    format: "gg.review"; version: 1; id: string; title: string; repository: string;
    author: Person; createdAt: string; completedAt: string | null; subject: Subject;
    snapshot: { from: RevId; to: RevId; members: Member[]; files: SnapshotFile[] };
    threads: Thread[]; seen: SeenEvent[];
};
export function uid() { return crypto.randomUUID(); }
export function now() { return new Date().toISOString(); }
export function subjectFor(detail: RevisionDetail, kind: Subject["kind"]): Subject {
    let header = detail.headers[0];
    if (!header) throw new Error("Select a revision before starting a review.");
    let { commit, change } = header.id;
    if (kind === "revset") return { kind, expression: detail.headers.map(item => item.id.commit.hex).join(" | "), commits: detail.headers.map(item => item.id.commit.hex) };
    if (detail.headers.length !== 1) throw new Error("Use Revset for a selection containing more than one revision.");
    return kind === "revision" ? { kind, commit: commit.hex, change: change.hex } : { kind, change: change.hex, observedCommit: commit.hex };
}
export function createReview(detail: RevisionDetail, files: RevChange[], title: string, repository: string, author: Person, kind: Subject["kind"]): Review {
    let subject = subjectFor(detail, kind);
    let review: Review = {
        format: "gg.review", version: 1, id: uid(), title: title.trim(), repository, author: { ...author }, createdAt: now(), completedAt: null, subject,
        snapshot: { from: detail.set.from, to: detail.set.to, members: detail.headers.map(header => ({ commit: header.id.commit.hex, change: header.id.change.hex, description: header.description.lines.join("") })), files: files.map(change => ({ id: uid(), change })) },
        threads: [], seen: [],
    };
    return parseReview(JSON.stringify(review));
}
export function latest<T extends { at: string; id: string }>(events: T[]): T | undefined {
    return [...events].sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || a.id.localeCompare(b.id)).at(-1);
}
export function threadStatus(thread: Thread): Status { return latest(thread.events)?.status ?? "open"; }
export function isSeen(review: Review, file: string, person: string): boolean { return latest(review.seen.filter(event => event.file === file && event.author.id === person))?.seen ?? false; }
export function anchorLabel(anchor: Anchor, review: Review): string {
    if (anchor.kind === "line") return `${review.snapshot.files.find(file => file.id === anchor.file)?.change.path.relative_path ?? "File"} · ${anchor.side === "deletions" ? "Old" : "New"} ${anchor.start}${anchor.end === anchor.start ? "" : `–${anchor.end}`}`;
    if (anchor.kind === "revset") return `Revset · ${anchor.commits.length} ${anchor.commits.length === 1 ? "revision" : "revisions"}`;
    return `${anchor.kind === "change" ? "Change" : "Revision"} ${anchor.kind === "change" ? anchor.change.slice(0, 12) : anchor.commit.slice(0, 12)}`;
}
export function lineAnchor(file: SnapshotFile, range: SelectedLineRange): Extract<Anchor, { kind: "line" }> {
    let side = range.side ?? "additions";
    if (range.endSide && range.endSide !== side) throw new Error("Select lines on one side of the diff.");
    let start = Math.min(range.start, range.end), end = Math.max(range.start, range.end);
    let selected = new Map<number, string>();
    for (let hunk of file.change.hunks) {
        let line = side === "additions" ? hunk.location.to_file.start : hunk.location.from_file.start;
        for (let text of hunk.lines.lines) {
            if (text.startsWith("\\") || text.startsWith(side === "additions" ? "-" : "+")) continue;
            if (line >= start && line <= end) selected.set(line, text.slice(1));
            line++;
        }
    }
    if (start < 1 || end - start > 499 || selected.size !== end - start + 1) throw new Error("Select up to 500 lines within the captured patch context.");
    return { kind: "line", file: file.id, side, start, end, quote: [...selected.values()].join("") };
}

// validate the transport before it can enter either storage or the diff renderer.
function assert(condition: unknown, message = "Invalid review JSON."): asserts condition { if (!condition) throw new Error(message); }
function object(value: unknown): Record<string, any> { assert(value && typeof value === "object" && !Array.isArray(value)); return value as Record<string, any>; }
function string(value: unknown, max = 20000): asserts value is string { assert(typeof value === "string" && value.length <= max); }
function nonempty(value: unknown, max = 300): asserts value is string { string(value, max); assert(value.trim().length > 0); }
function array(value: unknown, max: number): asserts value is any[] { assert(Array.isArray(value) && value.length <= max); }
function integer(value: unknown, min = 0): asserts value is number { assert(Number.isSafeInteger(value) && Number(value) >= min && Number(value) <= 10000000); }
function time(value: unknown) { string(value, 40); assert(/^\d{4}-\d\d-\d\dT/.test(value) && Number.isFinite(Date.parse(value))); }
function person(value: unknown) { let p = object(value); nonempty(p.id); nonempty(p.name, 120); }
function id(value: unknown) { let v = object(value); for (let name of ["commit", "change"]) { let part = object(v[name]); nonempty(part.hex, 256); string(part.prefix, 256); string(part.rest, 256); assert(part.type === (name === "commit" ? "CommitId" : "ChangeId")); } }
function subject(value: unknown, commits: Set<string>) {
    let v = object(value);
    assert(["revset", "revision", "change"].includes(v.kind));
    if (v.kind === "revset") { nonempty(v.expression, 20000); array(v.commits, 500); assert(v.commits.length > 0); v.commits.forEach((c: unknown) => { nonempty(c, 256); assert(commits.has(c)); }); }
    else { nonempty(v.change, 256); nonempty(v.kind === "revision" ? v.commit : v.observedCommit, 256); assert(commits.has(v.kind === "revision" ? v.commit : v.observedCommit)); }
}
function unique(items: { id: string }[]) { assert(new Set(items.map(item => item.id)).size === items.length, "Duplicate IDs in review JSON."); }
export function parseReview(json: string): Review {
    assert(new TextEncoder().encode(json).length <= MAX_BYTES, "Review exceeds the 10 MB limit.");
    let r = object(JSON.parse(json));
    assert(r.format === "gg.review" && r.version === 1, "Unsupported review format or version.");
    nonempty(r.id); nonempty(r.title, 240); nonempty(r.repository, 240); person(r.author); time(r.createdAt); if (r.completedAt !== null) time(r.completedAt);
    let snapshot = object(r.snapshot); id(snapshot.from); id(snapshot.to); array(snapshot.members, 500); assert(snapshot.members.length > 0);
    let commits = new Set<string>();
    for (let member of snapshot.members) { object(member); nonempty(member.commit, 256); nonempty(member.change, 256); string(member.description, 100000); assert(!commits.has(member.commit)); commits.add(member.commit); }
    assert(commits.has(snapshot.from.commit.hex) && commits.has(snapshot.to.commit.hex)); subject(r.subject, commits);
    array(snapshot.files, 500); unique(snapshot.files);
    for (let file of snapshot.files) {
        object(file); nonempty(file.id); let c = object(file.change); assert(["None", "Added", "Deleted", "Modified"].includes(c.kind)); assert(typeof c.has_conflict === "boolean");
        let path = object(c.path); nonempty(path.repo_path, 4096); nonempty(path.relative_path, 4096); array(c.hunks, 10000);
        if (c.stat !== undefined) { object(c.stat); integer(c.stat.added); integer(c.stat.removed); }
        for (let hunk of c.hunks) { object(hunk); let loc = object(hunk.location); for (let side of ["from_file", "to_file"]) { object(loc[side]); integer(loc[side].start); integer(loc[side].len); } object(hunk.lines); array(hunk.lines.lines, 200000); let before = 0, after = 0;
            for (let line of hunk.lines.lines) { string(line, MAX_BYTES); assert(/^[ +\-\\]/.test(line)); if (line[0] === " " || line[0] === "-") before++; if (line[0] === " " || line[0] === "+") after++; }
            assert(before === loc.from_file.len && after === loc.to_file.len, "Patch line counts do not match its ranges.");
        }
    }
    let files = new Map<string, SnapshotFile>(snapshot.files.map((f: SnapshotFile) => [f.id, f]));
    array(r.threads, 2000); unique(r.threads);
    for (let thread of r.threads) {
        object(thread); nonempty(thread.id); let anchor = object(thread.anchor);
        if (anchor.kind === "line") { nonempty(anchor.file); assert(files.has(anchor.file)); assert(anchor.side === "additions" || anchor.side === "deletions"); integer(anchor.start, 1); integer(anchor.end, anchor.start); string(anchor.quote, MAX_BYTES); let expected = lineAnchor(files.get(anchor.file)!, { start: anchor.start, end: anchor.end, side: anchor.side }); assert(anchor.quote === expected.quote, "Line comment does not match its captured source."); }
        else subject(anchor, commits);
        array(thread.posts, 2000); assert(thread.posts.length > 0); unique(thread.posts);
        for (let post of thread.posts) { object(post); nonempty(post.id); person(post.author); time(post.at); nonempty(post.body, 20000); }
        array(thread.events, 2000); unique(thread.events);
        for (let event of thread.events) { object(event); nonempty(event.id); person(event.author); time(event.at); assert(["open", "resolved", "obsolete"].includes(event.status)); }
    }
    array(r.seen, 20000); unique(r.seen);
    for (let event of r.seen) { object(event); nonempty(event.id); person(event.author); time(event.at); assert(files.has(event.file) && typeof event.seen === "boolean"); }
    // only the known document shape is persisted; rendering never interprets imported markup.
    return { format: "gg.review", version: 1, id: r.id, title: r.title, repository: r.repository, author: r.author, createdAt: r.createdAt, completedAt: r.completedAt, subject: r.subject, snapshot: r.snapshot, threads: r.threads, seen: r.seen };
}
function union<T extends { id: string }>(a: T[], b: T[]): T[] {
    let result = new Map(a.map(item => [item.id, item]));
    for (let item of b) { let previous = result.get(item.id); if (previous && JSON.stringify(previous) !== JSON.stringify(item)) throw new Error("This review contains conflicting event IDs. Keep both JSON files for comparison."); result.set(item.id, item); }
    return [...result.values()].sort((a, b) => (Date.parse((a as T & { at?: string }).at ?? "1970-01-01") - Date.parse((b as T & { at?: string }).at ?? "1970-01-01")) || a.id.localeCompare(b.id));
}
export function mergeReview(local: Review, incoming: Review): Review {
    for (let key of ["id", "title", "repository", "author", "createdAt", "subject", "snapshot"] as const) if (JSON.stringify(local[key]) !== JSON.stringify(incoming[key])) throw new Error("This review ID has a different snapshot or identity. Existing review was preserved.");
    let threads = new Map(local.threads.map(thread => [thread.id, thread]));
    for (let thread of incoming.threads) { let previous = threads.get(thread.id); if (!previous) threads.set(thread.id, thread); else { if (JSON.stringify(previous.anchor) !== JSON.stringify(thread.anchor)) throw new Error("Conflicting comment anchors. Existing review was preserved."); threads.set(thread.id, { ...previous, posts: union(previous.posts, thread.posts), events: union(previous.events, thread.events) }); } }
    return parseReview(JSON.stringify({ ...local, completedAt: [local.completedAt, incoming.completedAt].filter((v): v is string => !!v).sort((a, b) => Date.parse(a) - Date.parse(b)).at(-1) ?? null, threads: [...threads.values()], seen: union(local.seen, incoming.seen) }));
}
