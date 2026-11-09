import { get, writable } from "svelte/store";
import type { PluginAPI } from "../types";

import type { AnnotationList } from "../../messages/AnnotationList";
import type { ReviewProgress } from "../../messages/ReviewProgress";
import type { RevisionSummaryResult } from "../../messages/RevisionSummaryResult";
import type { TargetInput } from "../../messages/TargetInput";
import type { RevHeader } from "../../messages/RevHeader";
import type { SplitReceiptState } from "../../messages/SplitReceiptState";
import type { RevSet } from "../../messages/RevSet";
import { eventId, member, personKey, orderedMembers, project, revision, sameEvent, validateEvent, type ReceiptState, type ReviewEvent, type ReviewMember, type SessionState, type Verdict } from "./model";

export interface ReviewState {
    sessions: SessionState[];
    current: Map<string, RevHeader | null>;
    totals: Map<string, number>;
    annotations: AnnotationList | null;
    progress: ReviewProgress | null;
    notes: AnnotationList | null;
    selected: string | null;
    selection: RevSet | null;
    draftTargets: TargetInput[];
    creationHeaders: RevHeader[] | null;
    busy: boolean;
    error: string;
}
let prefix = "event-";
export function createReviewController(api: PluginAPI) {
    let reviewApi = api;
    let state = writable<ReviewState>({ sessions: [], current: new Map(), totals: new Map(), annotations: null, progress: null, notes: null, selected: null, selection: null, draftTargets: [], creationHeaders: null, busy: false, error: "" });
    let alive = true, epoch = 0;
    let events: ReviewEvent[] = [];
    let receiptStates: Record<string, ReceiptState> = {};
    let writing = false;
    let lastEventAt = 0;
    function timestamp() {
        lastEventAt = Math.max(Date.now(), lastEventAt + 1);
        return new Date(lastEventAt).toISOString();
    }
    async function load() {
        if (!alive || writing) return;
        let ticket = ++epoch;
        try {
            let [keys, annotations, progress] = await Promise.all([api.storage.keys(), api.annotations(), api.reviews()]);
            let loaded = await Promise.all(keys.filter(key => key.startsWith(prefix)).map(key => api.storage.get(key)));
            let next: ReviewEvent[] = [];
            for (let value of loaded) { validateEvent(value); next.push(value); }
            let sources = next.flatMap(event => event.type === "members" || event.type === "split-intent" ? [event.source] : []);
            let states: SplitReceiptState[] = [];
            if (sources.length) {
                let result = await api.query<SplitReceiptState[]>("query_split_receipt_states", { ids: [...new Map(sources.map(source => [source.commitId, revision(source)])).values()] });
                if (result.type !== "data") throw new Error(result.type === "error" ? result.message : "Split history is still loading");
                states = result.value;
            }
            let nextStates = Object.fromEntries(states.map(receipt => [receipt.receipt_id, receipt.state]));
            let intents = next.filter((event): event is Extract<ReviewEvent, { type: "split-intent" }> => event.type === "split-intent").sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
            for (let intent of intents) {
                let matches = states.filter(receipt => receipt.state === "active" && receipt.source.change.hex === intent.source.changeId && receipt.source.commit.hex === intent.source.commitId);
                if (matches.length > 1) throw new Error("Several active splits match this review. Resolve the change before continuing.");
                let receipt = matches[0];
                if (!receipt || next.some(event => event.type === "members" && event.sessionId === intent.sessionId && event.receiptId === receipt.receipt_id)) continue;
                if (!alive || ticket !== epoch) return;
                let event: ReviewEvent = {
                    id: `split-${intent.sessionId}-${receipt.receipt_id}`, at: intent.at, type: "members", sessionId: intent.sessionId, source: intent.source, receiptId: receipt.receipt_id,
                    members: [receipt.outcome.selected, receipt.outcome.remainder].map(id => ({ changeId: id.change.hex, commitId: id.commit.hex, description: intent.source.description })),
                };
                validateEvent(event);
                await api.storage.set(`${prefix}${event.id}`, event);
                next.push(event);
            }
            let sessions = project(next, nextStates);
            let members = new Map(sessions.flatMap(session => session.members).map(item => [item.changeId, item]));
            let totals = new Map<string, number>();
            let current = new Map(await Promise.all([...members.values()].map(async item => {
                let id = revision(item, true);
                let response = await api.query<RevisionSummaryResult>("query_revision_summary", { set: { from: id, to: id } });
                if (response.type !== "data") throw new Error(response.type === "error" ? response.message : "Revision is still loading");
                if (response.value.type === "Detail") totals.set(item.changeId, response.value.changes.length);
                return [item.changeId, response.value.type === "Detail" && response.value.headers.length === 1 && response.value.headers[0].id.change.hex === item.changeId ? response.value.headers[0] : null] as const;
            })));
            if (!alive || ticket !== epoch) return;
            events = next;
            receiptStates = nextStates;
            lastEventAt = Math.max(lastEventAt, ...next.map(event => Date.parse(event.at)));
            state.update(value => ({ ...value, sessions, current, totals, annotations, progress, error: "" }));
            await loadNotes();
        } catch (error) {
            if (alive && ticket === epoch) state.update(value => ({ ...value, error: String(error) }));
        }
    }
    let factsEpoch = 0;
    async function refreshFacts() {
        if (!alive || writing) return;
        let ticket = ++factsEpoch;
        try {
            let [annotations, progress] = await Promise.all([api.annotations(), api.reviews()]);
            if (!alive || ticket !== factsEpoch) return;
            state.update(value => ({ ...value, annotations, progress }));
            await loadNotes();
        } catch (error) { if (alive && ticket === factsEpoch) state.update(value => ({ ...value, error: String(error) })); }
    }
    let timer = setInterval(() => { if (document.visibilityState === "visible") void refreshFacts(); }, 3000);
    let notesEpoch = 0;
    async function loadNotes() {
        let selected = get(state).selected;
        let ticket = ++notesEpoch;
        if (!selected) { state.update(value => ({ ...value, notes: null })); return; }
        try {
            let notes = await reviewApi.notes.list(selected);
            if (alive && ticket === notesEpoch) state.update(value => ({ ...value, notes }));
        } catch (error) { if (alive && ticket === notesEpoch) state.update(value => ({ ...value, error: String(error) })); }
    }
    async function append(event: ReviewEvent) {
        if (!alive || writing) throw new Error("Review is no longer available or an update is still saving");
        validateEvent(event);
        writing = true;
        ++epoch;
        state.update(value => ({ ...value, busy: true, error: "" }));
        try {
            await api.storage.set(`${prefix}${event.id}`, event);
            if (!alive) return;
            events = [...events, event];
            state.update(value => ({ ...value, sessions: project(events, receiptStates) }));
        } catch (error) {
            if (alive) state.update(value => ({ ...value, error: String(error) }));
            throw error;
        } finally {
            writing = false;
            if (alive) { state.update(value => ({ ...value, busy: false })); await load(); }
        }
    }
    let lastStatus: unknown;
    let unsubscribe = api.context.subscribe(context => {
        state.update(value => ({ ...value, selection: context.selection ?? null }));
        if (context.status !== lastStatus) { lastStatus = context.status; void load(); }
    });
    return {
        state: { subscribe: state.subscribe },
        refresh: load,
        events(sessionId: string) {
            return structuredClone(events.filter(event => event.type === "created" ? event.session.id === sessionId : event.sessionId === sessionId));
        },
        async importEvents(imported: ReviewEvent[], captured?: { sessionId: string; snapshotId: string; capturedAt: string; states: Record<string, ReceiptState> }) {
            if (!alive || writing) throw new Error("Review is busy or unavailable");
            if (imported.length > 10_000) throw new Error("Too many review events");
            imported.forEach(validateEvent);
            let unique = new Map<string, ReviewEvent>();
            for (let event of imported) {
                let previous = unique.get(event.id) ?? await api.storage.get(`${prefix}${event.id}`);
                if (previous && !sameEvent(previous, event)) throw new Error(`Conflicting review event ${event.id}`);
                unique.set(event.id, event);
            }
            if (captured && Object.keys(captured.states).length) {
                let existing = [...events, ...imported].find(event => event.type === "receipt-hints" && event.sessionId === captured.sessionId && event.snapshotId === captured.snapshotId);
                if (existing?.type === "receipt-hints" && !sameEvent(existing.states, captured.states)) throw new Error("Conflicting captured split states");
                if (!existing) {
                    let hint: ReviewEvent = { id: eventId(), at: captured.capturedAt, type: "receipt-hints", sessionId: captured.sessionId, snapshotId: captured.snapshotId, states: captured.states };
                    validateEvent(hint); unique.set(hint.id, hint);
                }
            }
            writing = true; ++epoch;
            state.update(value => ({ ...value, busy: true, error: "" }));
            try {
                for (let event of unique.values()) await api.storage.set(`${prefix}${event.id}`, event);
            } finally {
                writing = false;
                if (alive) { state.update(value => ({ ...value, busy: false })); await load(); }
            }
        },
        select(id: string | null) { state.update(value => ({ ...value, selected: id, notes: null, draftTargets: [] })); void loadNotes(); },
        notes: loadNotes,
        compose(targets: TargetInput[]) {
            let value = get(state), session = value.sessions.find(session => session.id === value.selected);
            if (!session || !targets.length || targets.some(target => !session.members.some(member => member.changeId === target.anchor.change_id))) throw new Error("Select a review containing these changes first");
            state.update(value => ({ ...value, draftTargets: targets }));
        },
        clearComposer() { state.update(value => ({ ...value, draftTargets: [] })); },
        stageReview(headers: RevHeader[]) { state.update(value => ({ ...value, creationHeaders: headers })); },
        cancelCreation() { state.update(value => ({ ...value, creationHeaders: null })); },
        async create(title: string, emails: string, set: RevSet | null = get(state).selection) {
            let headers = get(state).creationHeaders;
            if (!headers) {
                if (!set) throw new Error("Select the changes to review first");
                let result = await api.query<RevisionSummaryResult>("query_revision_summary", { set });
                if (result.type !== "data" || result.value.type !== "Detail") throw new Error("The selected changes are unavailable");
                headers = result.value.headers;
            }
            let progress = get(state).progress ?? await api.reviews();
            if (!progress.me.name.trim() || !progress.me.email.trim()) throw new Error("Configure user.name and user.email in jj for this repository before starting a review.");
            let participants = [progress.me, ...emails.split(/[,\n]/).map(email => email.trim()).filter(Boolean).map(email => ({ name: email, email }))];
            participants = [...new Map(participants.map(person => [person.email.toLowerCase() || person.name, person])).values()];
            let id = eventId(), at = timestamp();
            await append({ id, at, type: "created", session: { id, title: title.trim() || "Review", createdAt: at, author: progress.me, participants, members: orderedMembers(headers) } });
            if (alive) state.update(value => ({ ...value, selected: id, creationHeaders: null }));
        },
        async verdict(session: SessionState, verdict: Verdict, body: string) {
            let value = get(state), versions = session.members.map(item => value.current.get(item.changeId));
            if (versions.some(header => !header || header.id.change.is_divergent)) throw new Error("Every member must resolve to one current change before recording a verdict");
            for (let header of versions) {
                let id = revision(member(header!), true);
                let result = await api.query<RevisionSummaryResult>("query_revision_summary", { set: { from: id, to: id } });
                if (result.type !== "data" || result.value.type !== "Detail" || result.value.headers.length !== 1 || result.value.headers[0].id.commit.hex !== header!.id.commit.hex) {
                    await load();
                    throw new Error("The changes moved while you were reviewing. Check the new versions before recording a verdict.");
                }
            }
            if (!value.progress?.me.name.trim() || !value.progress.me.email.trim()) throw new Error("Configure user.name and user.email in jj before recording a verdict.");
            if (!session.participants.some(person => personKey(person) === personKey(value.progress!.me))) throw new Error("Add yourself as a participant before recording a verdict");
            await append({ id: eventId(), at: timestamp(), type: "verdict", sessionId: session.id, person: value.progress.me, verdict, body: body.trim(), versions: versions.map(header => member(header!)) });
        },
        async split(session: SessionState, header: RevHeader) {
            if (!session.members.some(item => item.changeId === header.id.change.hex)) throw new Error("The change is not part of this review");
            await append({ id: eventId(), at: timestamp(), type: "split-intent", sessionId: session.id, source: member(header) });
            let outcome = await api.navigation.split(header.id);
            await load();
            return outcome;
        },
        async participants(session: SessionState, emails: string) {
            let participants = emails.split(/[,\n]/).map(email => email.trim()).filter(Boolean).map(email => ({ name: email, email }));
            await append({ id: eventId(), at: timestamp(), type: "participants", sessionId: session.id, participants });
        },
        dispose() { alive = false; ++epoch; ++notesEpoch; ++factsEpoch; clearInterval(timer); unsubscribe(); },
    };
}
export type ReviewController = ReturnType<typeof createReviewController>;
export let controllers = new WeakMap<PluginAPI, ReviewController>();
