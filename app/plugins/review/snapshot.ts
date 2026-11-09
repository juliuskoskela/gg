import type { PluginAPI } from "../types";
import type { AnnotationBundle } from "../../messages/AnnotationBundle";
import type { AnnotationList } from "../../messages/AnnotationList";
import type { ReviewProgress } from "../../messages/ReviewProgress";
import type { RevisionSummaryResult } from "../../messages/RevisionSummaryResult";
import type { RevsResult } from "../../messages/RevsResult";
import { member as memberOf, project, revision, validateEvent, type ReceiptState, type ReviewEvent, type ReviewMember, type SessionState } from "./model";
import { validateLegacy, type LegacyReviewSnapshot } from "./legacySnapshot";
import * as check from "./snapshotValidation";

export let MAX_SNAPSHOT_BYTES = 32 * 1024 * 1024;
export let SNAPSHOT_CHUNK_BYTES = 1024 * 1024;
export type CapturedMember = { member: ReviewMember } & ({ state: "captured"; detail: Extract<RevsResult, { type: "Detail" }> } | { state: "unavailable"; reason: string });
export interface ReviewSnapshotV2 {
    format: "gg.review";
    version: 2;
    id: string;
    capturedAt: string;
    session: SessionState;
    events: ReviewEvent[];
    members: CapturedMember[];
    notes: AnnotationBundle;
    capturedNotes: AnnotationList;
    capturedMarks: ReviewProgress;
}
export type ReviewSnapshot = ReviewSnapshotV2 | LegacyReviewSnapshot;
export interface CaptureAPI extends Pick<PluginAPI, "query" | "reviews" | "storage"> {
    notes: { export(context: string): Promise<AnnotationBundle>; list(context: string): Promise<AnnotationList> };
}
export function snapshotTitle(snapshot: ReviewSnapshot) { return snapshot.version === 2 ? snapshot.session.title : snapshot.title; }
function bytes(text: string) { return new TextEncoder().encode(text).length; }

function validateDetail(value: unknown, member: ReviewMember) {
    let detail = check.object(value);
    check.requireValue(detail.type === "Detail");
    let headers = check.array(detail.headers, 1);
    check.requireValue(headers.length === 1);
    let header = check.object(headers[0]), id = check.object(header.id);
    check.revisionId(id);
    check.requireValue(check.object(id.commit).hex === member.commitId && check.object(id.change).hex === member.changeId, "Captured diff belongs to another revision");
    for (let line of check.array(check.object(header.description).lines, 100_000)) check.text(line);
    let paths = new Set<unknown>();
    for (let file of check.array(detail.changes)) { check.change(file); check.requireValue(!paths.has(file.path.repo_path), "Duplicate captured file"); paths.add(file.path.repo_path); }
    for (let raw of check.array(detail.conflicts)) {
        let conflict = check.object(raw);
        check.change({ kind: "None", path: conflict.path, has_conflict: true, hunks: [conflict.hunk] });
    }
}
function annotationAuthor(value: unknown) { let author = check.object(value); check.text(author.name, 1000, true); check.requireValue(["human", "agent"].includes(String(author.kind))); }
function annotationAnchor(value: unknown) {
    let anchor = check.object(value);
    check.requireValue(["revision", "bookmark", "file", "lines"].includes(String(anchor.kind)));
    for (let key of ["change_id", "commit_id"]) { check.text(anchor[key], 128, true); check.requireValue(/^[a-z0-9]+$/i.test(String(anchor[key]))); }
    if (anchor.kind === "bookmark") { check.text(anchor.name, 4096, true); if (anchor.remote !== undefined) check.text(anchor.remote, 4096); }
    if (anchor.kind === "file" || anchor.kind === "lines") { check.text(anchor.path, 4096, true); check.requireValue(!anchor.path.startsWith("/") && !anchor.path.split("/").includes("..")); }
    if (anchor.kind === "lines") {
        check.requireValue(anchor.side === "old" || anchor.side === "new"); check.integer(anchor.start, 1); check.integer(anchor.end, Number(anchor.start));
        check.text(anchor.quote, 20_000); check.requireValue(bytes(anchor.quote) <= 20_000);
    }
}
function annotationTargets(value: unknown) {
    for (let raw of check.array(value, 500)) { let target = check.object(raw); annotationAnchor(target.anchor); check.text(target.subject, 100_000); }
}
function validateNotes(value: unknown, sessionId: string) {
    let bundle = check.object(value);
    check.requireValue(bytes(JSON.stringify(bundle)) <= 10 * 1024 * 1024, "Annotation bundle exceeds the 10 MiB limit");
    check.requireValue(bundle.format === "gg.annotation-bundle" && bundle.version === 1);
    let threads = check.array(bundle.threads, 2000), ids = new Set<unknown>();
    for (let raw of threads) {
        let archive = check.object(raw), header = check.object(archive.header);
        check.text(header.id, 128, true); check.requireValue(/^[a-f0-9-]+$/i.test(header.id)); check.requireValue(!ids.has(header.id), "Duplicate annotation archive"); ids.add(header.id);
        check.requireValue(header.format === "gg.annotation" && (header.version === 1 || header.version === 2)); check.time(header.created_at); annotationAuthor(header.author);
        let contexts = check.array(header.contexts, 100);
        check.requireValue(contexts.length > 0 && contexts.every(raw => { let context = check.object(raw); return context.plugin === "review" && context.id === sessionId; }), "Annotation archive belongs to another review");
        let targets = Array.isArray(header.targets) && header.targets.length ? header.targets : (header.anchor ? [{ anchor: header.anchor, subject: header.subject ?? "" }] : []);
        check.requireValue(check.array(targets, 500).length > 0); annotationTargets(targets);
        let events = check.array(archive.events, 10_000); check.unique(events);
        let posts = new Map<string, unknown>();
        for (let raw of events) {
            let event = check.object(raw); check.text(event.id, 128, true); check.requireValue(/^[a-f0-9-]+$/i.test(event.id)); check.time(event.at); annotationAuthor(event.author);
            check.requireValue(["post", "edit", "status", "add_targets", "remove_target"].includes(String(event.type)));
            if (event.type === "post" || event.type === "edit") { check.text(event.body, 100_000, true); check.requireValue(bytes(event.body) <= 100_000); }
            if (event.type === "post") posts.set(event.id, event.author);
            if (event.type === "edit") { check.text(event.post, 128, true); check.requireValue(check.canonical(posts.get(event.post)) === check.canonical(event.author), "Annotation edit has no matching author and post"); }
            if (event.type === "status") check.requireValue(event.status === "open" || event.status === "resolved");
            if (event.type === "add_targets") annotationTargets(event.targets);
            if (event.type === "remove_target") annotationAnchor(event.anchor);
        }
        check.requireValue(posts.size > 0, "Annotation has no posts");
    }
    return ids;
}
function validateDisplayNotes(value: unknown, ids: Set<unknown>) {
    let list = check.object(value); check.text(list.location, 4096); annotationAuthor(list.me);
    let threads = check.array(list.threads, 2000); check.unique(threads);
    for (let raw of threads) {
        let thread = check.object(raw); check.requireValue(ids.has(thread.id), "Displayed note has no annotation archive");
        check.text(thread.id, 300, true); check.requireValue(["open", "resolved"].includes(String(thread.status))); check.time(thread.created_at); check.time(thread.updated_at);
        for (let raw of check.array(thread.targets, 500)) { let target = check.object(raw); check.text(target.subject, 100_000); check.object(target.anchor); }
        let posts = check.array(thread.posts, 10_000); check.unique(posts);
        for (let raw of posts) { let post = check.object(raw); check.text(post.id, 300, true); annotationAuthor(post.author); check.time(post.created_at); check.text(post.body, 100_000); }
    }
}
function validateMarks(value: unknown, members: ReviewMember[]) {
    let progress = check.object(value); check.person(progress.me); check.text(progress.location, 4096);
    let rows = check.array(progress.changes, 500); check.unique(rows, "change_id");
    for (let raw of rows) {
        let row = check.object(raw); check.requireValue(members.some(member => member.changeId === row.change_id), "Captured marks belong to another review");
        check.integer(row.total); check.integer(row.reviewed); check.requireValue(Number(row.reviewed) <= Number(row.total));
        for (let raw of check.array(row.files)) { let file = check.object(raw); check.text(file.path, 4096, true); check.text(file.reviewed_commit_id, 256, true); check.time(file.reviewed_at); check.requireValue(["reviewed", "changed", "gone"].includes(String(file.state))); }
    }
}
export function parseSnapshot(json: string): ReviewSnapshot {
    check.requireValue(bytes(json) <= MAX_SNAPSHOT_BYTES, "Review snapshot exceeds the 32 MiB limit");
    let value: unknown = JSON.parse(json); check.bounded(value); let snapshot = check.object(value);
    check.requireValue(snapshot.format === "gg.review", "Unsupported review snapshot format");
    if (snapshot.version === 1) { validateLegacy(value); return value; }
    check.requireValue(snapshot.version === 2, "Unsupported review snapshot version");
    check.text(snapshot.id, 300, true); check.time(snapshot.capturedAt);
    let events = check.array(snapshot.events, 20_000); check.unique(events);
    for (let event of events) validateEvent(event);
    let session = check.object(snapshot.session), receiptStates = check.object(session.receiptStates ?? {});
    for (let state of Object.values(receiptStates)) check.requireValue(state === "active" || state === "inactive" || state === "unknown", "Invalid captured split state");
    let unverified = check.array(session.unverifiedReceipts ?? [], 2000); unverified.forEach(id => check.text(id, 300, true));
    let sessions = project(events as ReviewEvent[], receiptStates as Record<string, ReceiptState>, new Set(unverified as string[]));
    check.requireValue(sessions.length === 1 && check.canonical(sessions[0]) === check.canonical(session), "Captured session does not match its review history");
    let members = check.array(snapshot.members, 500); check.requireValue(members.length === sessions[0].members.length);
    let capturedIds = new Set<string>();
    for (let raw of members) {
        let captured = check.object(raw), member = check.object(captured.member);
        let source = sessions[0].members.find(item => item.changeId === member.changeId);
        check.text(member.description); check.requireValue(typeof member.commitId === "string" && /^[a-f0-9]+$/i.test(member.commitId));
        check.requireValue(source && !capturedIds.has(source.changeId), "Duplicate or unrelated captured member"); capturedIds.add(source.changeId);
        if (captured.state === "captured") validateDetail(captured.detail, { changeId: source.changeId, commitId: member.commitId, description: member.description });
        else { check.requireValue(captured.state === "unavailable"); check.text(captured.reason, 4096, true); }
    }
    let ids = validateNotes(snapshot.notes, String(session.id)); validateDisplayNotes(snapshot.capturedNotes, ids); validateMarks(snapshot.capturedMarks, sessions[0].members);
    return value as ReviewSnapshotV2;
}
export function stringifySnapshot(snapshot: ReviewSnapshot) { return check.canonical(parseSnapshot(JSON.stringify(snapshot))); }

export async function capture(api: CaptureAPI, session: SessionState, allEvents: ReviewEvent[], currentMembers?: readonly ReviewMember[]): Promise<ReviewSnapshotV2> {
    let events = allEvents.filter(event => event.type === "created" ? event.session.id === session.id : event.sessionId === session.id);
    let members: CapturedMember[] = [], size = 0;
    for (let original of session.members) {
        let member = currentMembers?.find(member => member.changeId === original.changeId);
        if (!currentMembers) {
            let current = revision(original, true);
            let summary = await api.query<RevisionSummaryResult>("query_revision_summary", { set: { from: current, to: current } });
            if (summary.type !== "data") throw new Error(summary.type === "error" ? summary.message : "Revision is still loading; retry capture");
            if (summary.type === "data" && summary.value.type === "Detail" && summary.value.headers.length === 1) member = memberOf(summary.value.headers[0]);
        }
        let captured: CapturedMember;
        if (!member) captured = { member: original, state: "unavailable", reason: "The current version of this change is no longer available" };
        else {
            let id = revision(member), response = await api.query<RevsResult>("query_revisions", { set: { from: id, to: id } });
            if (response.type !== "data") throw new Error(response.type === "error" ? response.message : "Revision is still loading; retry capture");
            captured = response.type === "data" && response.value.type === "Detail"
                ? { member, state: "captured", detail: response.value }
                : { member, state: "unavailable", reason: "The exact captured revision is no longer available" };
        }
        size += bytes(JSON.stringify(captured)); check.requireValue(size <= MAX_SNAPSHOT_BYTES, "Review snapshot exceeds the 32 MiB limit"); members.push(captured);
    }
    let notes = await api.notes.export(session.id), capturedNotes = await api.notes.list(session.id), progress = await api.reviews();
    for (let captured of members) {
        let current = revision(captured.member, true);
        let response = await api.query<RevisionSummaryResult>("query_revision_summary", { set: { from: current, to: current } });
        if (response.type !== "data") throw new Error(response.type === "error" ? response.message : "Revision is still loading; retry capture");
        let commit = response.type === "data" && response.value.type === "Detail" && response.value.headers.length === 1 ? response.value.headers[0].id.commit.hex : null;
        check.requireValue(commit === (captured.state === "captured" ? captured.member.commitId : null), "The review changed during capture. Refresh and export again.");
    }
    let ids = new Set(notes.threads.map(thread => thread.header.id));
    let snapshot: ReviewSnapshotV2 = {
        format: "gg.review", version: 2, id: crypto.randomUUID(), capturedAt: new Date().toISOString(), session, events, members, notes,
        capturedNotes: { ...capturedNotes, location: "Captured snapshot", threads: capturedNotes.threads.filter(thread => ids.has(thread.id)) },
        capturedMarks: { ...progress, location: "Captured snapshot", changes: progress.changes.filter(change => session.members.some(member => member.changeId === change.change_id)) },
    };
    return parseSnapshot(JSON.stringify(snapshot)) as ReviewSnapshotV2;
}

interface SnapshotManifest { format: "gg.review.storage"; version: 1; id: string; title: string; digest: string; size: number; parts: { key: string; digest: string }[]; }
type StorageAPI = Pick<PluginAPI, "storage">;
async function digest(text: string) { return [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)))].map(byte => byte.toString(16).padStart(2, "0")).join(""); }
function chunks(text: string) {
    let result: string[] = [];
    for (let start = 0; start < text.length;) {
        let lo = 1, hi = Math.min(text.length - start, SNAPSHOT_CHUNK_BYTES), length = 1;
        while (lo <= hi) { let middle = Math.floor((lo + hi) / 2); if (bytes(JSON.stringify({ data: text.slice(start, start + middle) })) <= SNAPSHOT_CHUNK_BYTES) { length = middle; lo = middle + 1; } else hi = middle - 1; }
        let end = start + length;
        if (end < text.length && /[\uD800-\uDBFF]/.test(text[end - 1])) end--;
        check.requireValue(end > start, "Could not split review snapshot"); result.push(text.slice(start, end)); start = end;
    }
    return result;
}
function manifest(value: unknown): SnapshotManifest {
    let item = check.object(value); check.requireValue(item.format === "gg.review.storage" && item.version === 1);
    check.text(item.id, 300, true); check.text(item.title, 100_000, true); check.requireValue(/^[a-f0-9]{64}$/.test(String(item.digest))); check.integer(item.size, 1); check.requireValue(Number(item.size) <= MAX_SNAPSHOT_BYTES);
    let parts = check.array(item.parts, 256); check.requireValue(parts.length > 0); check.unique(parts, "key");
    for (let raw of parts) { let part = check.object(raw); check.requireValue(/^snapshot-part-[a-f0-9]{64}-\d+$/.test(String(part.key)) && /^[a-f0-9]{64}$/.test(String(part.digest))); }
    return value as SnapshotManifest;
}
async function manifests(api: StorageAPI) {
    let values: SnapshotManifest[] = [];
    for (let key of (await api.storage.keys()).filter(key => /^snapshot-[a-f0-9]{64}$/.test(key))) {
        let saved = manifest(await api.storage.get(key));
        check.requireValue(key === `snapshot-${saved.digest}`, "Stored snapshot manifest has the wrong address");
        values.push(saved);
    }
    return values;
}
export async function saveSnapshot(api: StorageAPI, snapshot: ReviewSnapshot) {
    let json = stringifySnapshot(snapshot), hash = await digest(json), key = `snapshot-${hash}`;
    let previous = (await manifests(api)).filter(saved => saved.id === snapshot.id);
    check.requireValue(previous.every(saved => saved.digest === hash), "This snapshot ID already contains different content; its saved copy was preserved");
    if (previous.length) { await loadSnapshot(api, snapshot.id); return; }
    let parts = [];
    for (let [index, data] of chunks(json).entries()) {
        let part = { key: `snapshot-part-${hash}-${index}`, digest: await digest(data) }, previous = await api.storage.get(part.key);
        check.requireValue(previous === null || previous === undefined || check.canonical(previous) === check.canonical({ data }), "A stored snapshot chunk has different content");
        if (previous === null || previous === undefined) await api.storage.set(part.key, { data }); parts.push(part);
    }
    // content addressing preserves both copies if concurrent windows import a conflicting identity.
    // publishing the manifest last keeps interrupted writes out of the visible library.
    await api.storage.set(key, { format: "gg.review.storage", version: 1, id: snapshot.id, title: snapshotTitle(snapshot), digest: hash, size: bytes(json), parts } satisfies SnapshotManifest);
    check.requireValue((await manifests(api)).filter(saved => saved.id === snapshot.id).every(saved => saved.digest === hash), "Conflicting snapshots with the same ID were preserved; import a copy with a new ID");
}
export async function loadSnapshot(api: StorageAPI, id: string): Promise<ReviewSnapshot> {
    let matches = (await manifests(api)).filter(saved => saved.id === id);
    check.requireValue(matches.length === 1, matches.length ? "Conflicting snapshots with the same ID were preserved" : "Stored snapshot is missing");
    let saved = matches[0], chunks: string[] = [], size = 0;
    for (let part of saved.parts) {
        let raw = check.object(await api.storage.get(part.key)); check.text(raw.data, SNAPSHOT_CHUNK_BYTES);
        check.requireValue(bytes(JSON.stringify(raw)) <= SNAPSHOT_CHUNK_BYTES && await digest(raw.data) === part.digest, "Stored snapshot chunk is missing or damaged");
        size += bytes(raw.data); check.requireValue(size <= MAX_SNAPSHOT_BYTES); chunks.push(raw.data);
    }
    let json = chunks.join(""); check.requireValue(size === saved.size && await digest(json) === saved.digest, "Stored snapshot is incomplete or damaged");
    let snapshot = parseSnapshot(json); check.requireValue(snapshot.id === id && snapshotTitle(snapshot) === saved.title); return snapshot;
}
export async function listSnapshots(api: StorageAPI): Promise<{ id: string; title: string }[]> {
    let values = await manifests(api);
    check.requireValue(new Set(values.map(value => value.id)).size === values.length, "Conflicting snapshots with the same ID were preserved");
    return values.map(({ id, title }) => ({ id, title }));
}
