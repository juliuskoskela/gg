import { describe, expect, it, vi } from "vitest";
import { get, writable } from "svelte/store";
import { createReviewController } from "./controller";
import type { SplitReceiptState } from "../../messages/SplitReceiptState";
import type { AnnotationList } from "../../messages/AnnotationList";
import type { PluginAPI } from "../types";
import type { PluginContext } from "../types";
import type { RevHeader } from "../../messages/RevHeader";
import type { ReviewEvent } from "./model";

let me = { name: "Me", email: "me@example.com" };
function header(commit = "123"): RevHeader {
    return { id: { change: { type: "ChangeId", hex: "abc", prefix: "abc", rest: "", offset: null, is_divergent: false }, commit: { type: "CommitId", hex: commit, prefix: commit, rest: "" } }, description: { lines: ["Feature"], truncated: false }, author: { name: "Me", email: "me@example.com", timestamp: "2026-11-01T00:00:00Z" }, parent_ids: [], refs: [], has_conflict: false, is_working_copy: false, is_immutable: false, working_copy_of: null } as unknown as RevHeader;
}
function setup() {
    let values = new Map<string, unknown>();
    let context = writable<PluginContext>({ repository: "repo", workspace: "/repo", status: undefined, selection: { from: header().id, to: header().id } });
    let query = vi.fn(async () => ({ type: "data", value: { type: "Detail", set: { from: header().id, to: header().id }, headers: [header()], parents: [], changes: [], conflicts: [] } }));
    let notes = { location: "", me: { name: "Me", kind: "human" }, threads: [] };
    let api = { context, query, annotations: async () => notes, reviews: async () => ({ me, changes: [], location: "" }), storage: { keys: async () => [...values.keys()], get: async (key: string) => values.get(key), set: vi.fn(async (key: string, value: unknown) => { values.set(key, value); }), delete: async (key: string) => { values.delete(key); } }, navigation: { select: vi.fn() }, notes: { list: vi.fn(async () => notes) }, publish: vi.fn() } as unknown as PluginAPI;
    let controller = createReviewController(api);
    return { controller, api, values, query, context };
}
describe("review plugin controller", () => {
    it("stores immutable session and verdict events in plugin storage and replays after reopening", async () => {
        let { controller, api, values } = setup();
        await controller.refresh();
        await controller.create("Feature review", "other@example.com");
        let session = get(controller.state).sessions[0];
        expect(session.participants.map(person => person.email)).toEqual([me.email, "other@example.com"]);
        expect(session.members[0].commitId).toBe("123");
        await controller.verdict(session, "approve", "Looks good");
        expect(values.size).toBe(2);
        expect([...values.values()].map(value => (value as ReviewEvent).type)).toEqual(["created", "verdict"]);
        controller.dispose();
        let reopened = createReviewController(api);
        await reopened.refresh();
        expect(get(reopened.state).sessions[0].verdicts[0].body).toBe("Looks good");
        reopened.dispose();
    });
    it("asks for a real jj identity instead of inventing a reviewer", async () => {
        let { controller, api, values } = setup();
        api.reviews = async () => ({ me: { name: "", email: "" }, changes: [], location: "" });
        await controller.refresh();
        await expect(controller.create("Review", "")).rejects.toThrow("Configure user.name and user.email");
        expect(values.size).toBe(0);
        controller.dispose();
    });
    it("creates a review from exactly the scattered headers staged by its context command", async () => {
        let { controller } = setup();
        await controller.refresh();
        let second = header("456"); second.id.change.hex = "def";
        controller.stageReview([header(), second]);
        await controller.create("Scattered review", "", null);
        expect(get(controller.state).sessions[0].members.map(member => member.changeId)).toEqual(["def", "abc"]);
        expect(get(controller.state).creationHeaders).toBeNull();
        controller.dispose();
    });
    it("rejects approval if the live version changed since the reviewer saw it", async () => {
        let { controller, query, values } = setup();
        await controller.refresh();
        await controller.create("Feature", "");
        query.mockImplementation(async () => ({ type: "data", value: { type: "Detail", set: { from: header("456").id, to: header("456").id }, headers: [header("456")], parents: [], changes: [], conflicts: [] } }));
        await expect(controller.verdict(get(controller.state).sessions[0], "approve", "")).rejects.toThrow("moved");
        expect(values.size).toBe(1);
        controller.dispose();
    });
    it("rejects conflicting imported event IDs before writing anything", async () => {
        let { controller, values } = setup();
        await controller.refresh();
        await controller.create("Original", "");
        let event = [...values.values()][0] as Extract<ReviewEvent, { type: "created" }>;
        await expect(controller.importEvents([{ ...event, session: { ...event.session, title: "Replaced" } }])).rejects.toThrow("Conflicting");
        expect(values.size).toBe(1);
        expect(get(controller.state).sessions[0].title).toBe("Original");
        await controller.importEvents([{ session: event.session, type: event.type, at: event.at, id: event.id }]);
        expect(values.size).toBe(1);
        controller.dispose();
    });
    it("ignores a pending repository read after disposal", async () => {
        let { controller, api } = setup();
        let resolve!: (keys: string[]) => void;
        api.storage.keys = () => new Promise<string[]>(done => { resolve = done; });
        let pending = controller.refresh();
        controller.dispose();
        resolve([]);
        await pending;
        expect(get(controller.state).progress).toBeNull();
    });
    it("recovers a committed split once, restores members after undo, and preserves unknown imported history", async () => {
        let { controller, api, values } = setup();
        let states: SplitReceiptState[] = [];
        let original = api.query;
        api.query = vi.fn((command, args) => command === "query_split_receipt_states" ? Promise.resolve({ type: "data", value: states }) : original(command, args)) as PluginAPI["query"];
        await controller.refresh();
        await controller.create("Split review", "");
        let session = get(controller.state).sessions[0];
        await controller.importEvents([{ id: "intent", at: "2026-11-02T00:00:00Z", type: "split-intent", sessionId: session.id, source: session.members[0] }]);
        let selected = header("456").id, remainder = header("789").id; remainder.change.hex = "def";
        states = [{ receipt_id: "receipt", source: header().id, state: "active", outcome: { receipt_id: "receipt", source: header().id, selected, remainder, operation_id: "operation", ownership: [] } }];
        await controller.refresh();
        expect(get(controller.state).sessions[0].members.map(member => member.changeId)).toEqual(["abc", "def"]);
        let count = values.size;
        await controller.refresh();
        expect(values.size).toBe(count);
        states[0].state = "inactive";
        await controller.refresh();
        expect(get(controller.state).sessions[0].members.map(member => member.changeId)).toEqual(["abc"]);
        states = [];
        await controller.refresh();
        expect(get(controller.state).sessions[0].members.map(member => member.changeId)).toEqual(["abc", "def"]);
        expect(get(controller.state).sessions[0].receiptStates.receipt).toBe("unknown");
        await controller.importEvents([], { sessionId: session.id, snapshotId: "captured-after-undo", capturedAt: new Date().toISOString(), states: { receipt: "inactive" } });
        expect(get(controller.state).sessions[0].members.map(member => member.changeId)).toEqual(["abc"]);
        expect(get(controller.state).sessions[0].unverifiedReceipts).toEqual(["receipt"]);
        states = [{ receipt_id: "receipt", source: header().id, state: "active", outcome: { receipt_id: "receipt", source: header().id, selected, remainder, operation_id: "operation", ownership: [] } }];
        await controller.refresh();
        expect(get(controller.state).sessions[0].members.map(member => member.changeId)).toEqual(["abc", "def"]);
        expect(get(controller.state).sessions[0].unverifiedReceipts).toEqual([]);
        controller.dispose();
    });
    it("uses core context-scoped annotation reads and discards an old selected-session response", async () => {
        let { controller, api } = setup();
        await controller.refresh();
        await controller.create("First", "");
        let first = get(controller.state).sessions[0].id;
        let resolve!: (notes: AnnotationList) => void;
        api.notes.list = vi.fn(() => new Promise<AnnotationList>(done => { resolve = done; }));
        controller.select(first);
        controller.select(null);
        resolve({ location: "old", me: { name: "Me", kind: "human" }, threads: [] });
        await Promise.resolve();
        expect(get(controller.state).notes).toBeNull();
        controller.dispose();
    });
});
