import type { ReviewPerson } from "../../messages/ReviewPerson";
import type { ReviewProgress } from "../../messages/ReviewProgress";
import type { RevHeader } from "../../messages/RevHeader";
import type { RevId } from "../../messages/RevId";

export type Verdict = "approve" | "request-changes" | "comment";
export interface ReviewMember { changeId: string; commitId: string; description: string; }
export interface ReviewSession {
    id: string;
    title: string;
    createdAt: string;
    author: ReviewPerson;
    participants: ReviewPerson[];
    members: ReviewMember[];
}
export type ReviewEvent = { id: string; at: string } & (
    { type: "created"; session: ReviewSession } |
    { type: "verdict"; sessionId: string; person: ReviewPerson; verdict: Verdict; body: string; versions: ReviewMember[] } |
    { type: "members"; sessionId: string; source: ReviewMember; members: ReviewMember[]; receiptId: string } |
    { type: "split-intent"; sessionId: string; source: ReviewMember } |
    { type: "participants"; sessionId: string; participants: ReviewPerson[] } |
    { type: "receipt-hints"; sessionId: string; snapshotId: string; states: Record<string, ReceiptState> }
);
export type VerdictEvent = Extract<ReviewEvent, { type: "verdict" }>;
export type ReceiptState = "active" | "inactive" | "unknown";
export type SessionState = ReviewSession & { verdicts: VerdictEvent[]; receipts: string[]; splitIntents: ReviewMember[]; receiptStates: Record<string, ReceiptState>; unverifiedReceipts: string[] };
export type CurrentVersions = ReadonlyMap<string, string | null>;
export function personKey(person: ReviewPerson) { return person.email.trim().toLowerCase() || person.name.trim(); }
export function member(header: RevHeader): ReviewMember {
    return { changeId: header.id.change.hex, commitId: header.id.commit.hex, description: header.description.lines.join("\n") };
}
export function orderedMembers(headers: readonly RevHeader[]): ReviewMember[] {
    let byCommit = new Map(headers.map(header => [header.id.commit.hex, header]));
    let seen = new Set<string>(), ordered: ReviewMember[] = [];
    function visit(header: RevHeader) {
        if (seen.has(header.id.commit.hex)) return;
        seen.add(header.id.commit.hex);
        for (let parent of header.parent_ids) { let selected = byCommit.get(parent.hex); if (selected) visit(selected); }
        ordered.push(member(header));
    }
    [...headers].reverse().forEach(visit);
    return ordered;
}
export function revision(member: ReviewMember, current = false): RevId {
    return {
        change: { type: "ChangeId", hex: member.changeId, prefix: member.changeId.slice(0, 8), rest: member.changeId.slice(8), offset: null, is_divergent: false },
        commit: { type: "CommitId", hex: current ? "" : member.commitId, prefix: current ? "" : member.commitId.slice(0, 8), rest: current ? "" : member.commitId.slice(8) },
    };
}
export function sameEvent(left: unknown, right: unknown) {
    let canonical = (value: unknown) => JSON.stringify(value, (_key, item) => item && typeof item === "object" && !Array.isArray(item)
        ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
    return canonical(left) === canonical(right);
}
export function eventId() { return `${Date.now().toString().padStart(16, "0")}-${crypto.randomUUID()}`; }
export function project(events: readonly ReviewEvent[], receiptStates: Readonly<Record<string, ReceiptState>> = {}, unverified: ReadonlySet<string> = new Set()): SessionState[] {
    let sessions = new Map<string, SessionState>();
    let ordered = [...events].sort((a, b) => Number(b.type === "created") - Number(a.type === "created") || a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
    let hints = new Map<string, Map<string, ReceiptState>>();
    for (let event of ordered) if (event.type === "receipt-hints") {
        let states = hints.get(event.sessionId) ?? new Map<string, ReceiptState>();
        for (let [id, state] of Object.entries(event.states)) states.set(id, state);
        hints.set(event.sessionId, states);
    }
    for (let event of ordered) {
        if (event.type === "created") {
            if (!sessions.has(event.session.id)) sessions.set(event.session.id, { ...event.session, members: [...event.session.members], participants: [...event.session.participants], verdicts: [], receipts: [], splitIntents: [], receiptStates: {}, unverifiedReceipts: [] });
            continue;
        }
        let session = sessions.get(event.sessionId);
        if (!session) continue;
        if (event.type === "verdict") session.verdicts.push(event);
        else if (event.type === "receipt-hints") continue;
        else if (event.type === "participants") session.participants = [...event.participants];
        else if (event.type === "split-intent") {
            if (!session.splitIntents.some(source => source.commitId === event.source.commitId)) session.splitIntents.push(event.source);
        } else if (!session.receipts.includes(event.receiptId)) {
            let known = Object.hasOwn(receiptStates, event.receiptId) && !unverified.has(event.receiptId);
            let status = Object.hasOwn(receiptStates, event.receiptId) ? receiptStates[event.receiptId] : hints.get(event.sessionId)?.get(event.receiptId) ?? "unknown";
            if (!known && !session.unverifiedReceipts.includes(event.receiptId)) session.unverifiedReceipts.push(event.receiptId);
            Object.defineProperty(session.receiptStates, event.receiptId, { value: status, enumerable: true, writable: true });
            if (status === "inactive") continue;
            let index = session.members.findIndex(member => member.changeId === event.source.changeId);
            if (index >= 0) session.members.splice(index, 1, ...event.members);
            session.receipts.push(event.receiptId);
        }
    }
    return [...sessions.values()];
}
export function verdictFor(session: SessionState, person: ReviewPerson, current: CurrentVersions) {
    let event = session.verdicts.filter(event => personKey(event.person) === personKey(person)).at(-1);
    if (!event) return null;
    let stale = event.versions.length !== session.members.length || session.members.some(member =>
        current.get(member.changeId) !== event.versions.find(version => version.changeId === member.changeId)?.commitId);
    return { event, stale };
}
export function waitingFor(session: SessionState, person: ReviewPerson, current: CurrentVersions) {
    if (!session.participants.some(participant => personKey(participant) === personKey(person))) return false;
    let verdict = verdictFor(session, person, current);
    return !verdict || verdict.stale || verdict.event.verdict === "comment";
}
export function progressFor(session: SessionState, progress: ReviewProgress | null, totals?: ReadonlyMap<string, number>) {
    let rows = session.members.map(member => progress?.changes.find(change => change.change_id === member.changeId));
    return { reviewed: rows.reduce((sum, row) => sum + (row?.reviewed ?? 0), 0), total: rows.reduce((sum, row, index) => sum + (row?.total ?? totals?.get(session.members[index].changeId) ?? 0), 0), known: rows.every((row, index) => !!row || totals?.has(session.members[index].changeId)) };
}
export function queue(sessions: readonly SessionState[], me: ReviewPerson, versions: CurrentVersions, progress: ReviewProgress | null, totals?: ReadonlyMap<string, number>) {
    return sessions.filter(session => waitingFor(session, me, versions)).sort((a, b) => {
        let first = progressFor(a, progress, totals), second = progressFor(b, progress, totals);
        let firstRemaining = first.known ? first.total - first.reviewed : Number.MAX_SAFE_INTEGER;
        let secondRemaining = second.known ? second.total - second.reviewed : Number.MAX_SAFE_INTEGER;
        return firstRemaining - secondRemaining || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
    });
}
export function validateEvent(value: unknown): asserts value is ReviewEvent {
    let event = value as ReviewEvent;
    let text = (value: unknown) => typeof value === "string" && value.trim().length > 0 && value.length <= 100_000;
    let person = (value: ReviewPerson) => value && text(value.name) && typeof value.email === "string" && value.email.length <= 1000;
    let people = (value: ReviewPerson[]) => Array.isArray(value) && value.length > 0 && value.length <= 100 && value.every(person) && new Set(value.map(personKey)).size === value.length;
    let members = (value: ReviewMember[]) => Array.isArray(value) && value.length > 0 && value.length <= 500 && value.every(member => member && /^[a-z0-9]+$/i.test(member.changeId) && /^[a-f0-9]+$/i.test(member.commitId) && typeof member.description === "string" && member.description.length <= 100_000) && new Set(value.map(member => member.changeId)).size === value.length;
    if (!event || !/^[a-z0-9_-]{1,120}$/i.test(event.id) || !text(event.at) || !Number.isFinite(Date.parse(event.at))) throw new Error("Invalid review event");
    if (event.type === "created") {
        let session = event.session;
        if (!session || !text(session.id) || !text(session.title) || session.title.length > 240 || !Number.isFinite(Date.parse(session.createdAt)) || !person(session.author) || !people(session.participants) || !members(session.members)) throw new Error("Invalid review session");
    } else if (!text(event.sessionId)) throw new Error("Invalid review session identifier");
    else if (event.type === "verdict") {
        if (!person(event.person) || !["approve", "request-changes", "comment"].includes(event.verdict) || typeof event.body !== "string" || event.body.length > 100_000 || !members(event.versions)) throw new Error("Invalid review verdict");
    } else if (event.type === "members") {
        if (!members([event.source]) || !members(event.members) || !text(event.receiptId)) throw new Error("Invalid review split receipt");
    } else if (event.type === "split-intent") {
        if (!members([event.source])) throw new Error("Invalid review split intent");
    } else if (event.type === "receipt-hints") {
        if (!text(event.snapshotId) || !event.states || typeof event.states !== "object" || Array.isArray(event.states) || Object.keys(event.states).length > 2000 || Object.entries(event.states).some(([id, state]) => !text(id) || !["active", "inactive", "unknown"].includes(state))) throw new Error("Invalid captured split states");
    } else if (event.type === "participants") {
        if (!people(event.participants)) throw new Error("Invalid review participants");
    } else throw new Error("Unknown review event");
}
