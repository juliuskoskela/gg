import { describe, expect, it, vi } from "vitest";
import { get, writable } from "svelte/store";
import { createReviewController } from "./controller";
import type { AnnotationList } from "../../messages/AnnotationList";
import type { ReviewAPI } from "./api";
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
    let api = { context, query, annotations: async () => notes, reviews: async () => ({ me, changes: [], location: "" }), storage: { keys: async () => [...values.keys()], get: async (key: string) => values.get(key), set: vi.fn(async (key: string, value: unknown) => { values.set(key, value); }), delete: async (key: string) => { values.delete(key); } }, navigation: { select: vi.fn() }, notes: { list: vi.fn(async () => notes) }, publish: vi.fn() } as unknown as ReviewAPI;
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
        await controller.importEvents([event]);
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
