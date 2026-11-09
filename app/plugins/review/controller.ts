import { get, writable } from "svelte/store";
import type { PluginAPI } from "../types";
import type { ReviewAPI } from "./api";
import type { AnnotationList } from "../../messages/AnnotationList";
import type { ReviewProgress } from "../../messages/ReviewProgress";
import type { RevisionSummaryResult } from "../../messages/RevisionSummaryResult";
import type { RevHeader } from "../../messages/RevHeader";
import type { RevSet } from "../../messages/RevSet";
import { eventId, member, personKey, project, revision, validateEvent, type ReviewEvent, type ReviewMember, type SessionState, type Verdict } from "./model";

export interface ReviewState {
    sessions: SessionState[];
    current: Map<string, RevHeader | null>;
    annotations: AnnotationList | null;
    progress: ReviewProgress | null;
    notes: AnnotationList | null;
    selected: string | null;
    selection: RevSet | null;
    busy: boolean;
    error: string;
}
let prefix = "event-";
export function createReviewController(api: PluginAPI) {
    let reviewApi = api as ReviewAPI;
    let state = writable<ReviewState>({ sessions: [], current: new Map(), annotations: null, progress: null, notes: null, selected: null, selection: null, busy: false, error: "" });
    let alive = true, epoch = 0;
    let events: ReviewEvent[] = [];
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
            let sessions = project(next);
            let members = new Map(sessions.flatMap(session => session.members).map(item => [item.changeId, item]));
            let current = new Map(await Promise.all([...members.values()].map(async item => {
                let id = revision(item, true);
                let response = await api.query<RevisionSummaryResult>("query_revision_summary", { set: { from: id, to: id } });
                if (response.type !== "data") throw new Error(response.type === "error" ? response.message : "Revision is still loading");
                return [item.changeId, response.value.type === "Detail" && response.value.headers.length === 1 ? response.value.headers[0] : null] as const;
            })));
            if (!alive || ticket !== epoch) return;
            events = next;
            lastEventAt = Math.max(lastEventAt, ...next.map(event => Date.parse(event.at)));
            state.update(value => ({ ...value, sessions, current, annotations, progress, error: "" }));
            await loadNotes();
        } catch (error) {
            if (alive && ticket === epoch) state.update(value => ({ ...value, error: String(error) }));
        }
    }
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
            state.update(value => ({ ...value, sessions: project(events) }));
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
        async importEvents(imported: ReviewEvent[]) {
            if (!alive || writing) throw new Error("Review is busy or unavailable");
            if (imported.length > 10_000) throw new Error("Too many review events");
            imported.forEach(validateEvent);
            let unique = new Map<string, ReviewEvent>();
            for (let event of imported) {
                let previous = unique.get(event.id) ?? await api.storage.get(`${prefix}${event.id}`);
                if (previous && JSON.stringify(previous) !== JSON.stringify(event)) throw new Error(`Conflicting review event ${event.id}`);
                unique.set(event.id, event);
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
        select(id: string | null) { state.update(value => ({ ...value, selected: id, notes: null })); void loadNotes(); },
        notes: loadNotes,
        async create(title: string, emails: string, set: RevSet | null = get(state).selection) {
            if (!set) throw new Error("Select the changes to review first");
            let result = await api.query<RevisionSummaryResult>("query_revision_summary", { set });
            if (result.type !== "data" || result.value.type !== "Detail") throw new Error("The selected changes are unavailable");
            let progress = get(state).progress ?? await api.reviews();
            let participants = [progress.me, ...emails.split(/[,\n]/).map(email => email.trim()).filter(Boolean).map(email => ({ name: email, email }))];
            participants = [...new Map(participants.map(person => [person.email.toLowerCase() || person.name, person])).values()];
            let id = eventId(), at = timestamp();
            await append({ id, at, type: "created", session: { id, title: title.trim() || "Review", createdAt: at, author: progress.me, participants, members: [...result.value.headers].reverse().map(member) } });
            if (alive) state.update(value => ({ ...value, selected: id }));
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
            if (!value.progress) throw new Error("Reviewer identity is unavailable");
            if (!session.participants.some(person => personKey(person) === personKey(value.progress!.me))) throw new Error("Add yourself as a participant before recording a verdict");
            await append({ id: eventId(), at: timestamp(), type: "verdict", sessionId: session.id, person: value.progress.me, verdict, body: body.trim(), versions: versions.map(header => member(header!)) });
        },
        async splitIntent(session: SessionState, source: ReviewMember) {
            await append({ id: eventId(), at: timestamp(), type: "split-intent", sessionId: session.id, source });
        },
        async replaceMembers(session: SessionState, source: ReviewMember, members: ReviewMember[], receiptId: string) {
            await append({ id: eventId(), at: timestamp(), type: "members", sessionId: session.id, source, members, receiptId });
        },
        async participants(session: SessionState, emails: string) {
            let participants = emails.split(/[,\n]/).map(email => email.trim()).filter(Boolean).map(email => ({ name: email, email }));
            await append({ id: eventId(), at: timestamp(), type: "participants", sessionId: session.id, participants });
        },
        dispose() { alive = false; ++epoch; ++notesEpoch; unsubscribe(); },
    };
}
export type ReviewController = ReturnType<typeof createReviewController>;
export let controllers = new WeakMap<PluginAPI, ReviewController>();
