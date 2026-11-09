import { describe, expect, it, vi } from "vitest";
import { capture, loadSnapshot, saveSnapshot, listSnapshots, parseSnapshot, stringifySnapshot, SNAPSHOT_CHUNK_BYTES, type CaptureAPI } from "./snapshot";
import { snapshotFixture, legacyFixture } from "./snapshot.fixture";
function storage() {
    let values = new Map<string, unknown>();
    let api = { storage: { get: vi.fn(async (key: string) => values.get(key)), set: vi.fn(async (key: string, value: unknown) => {
        expect(new TextEncoder().encode(JSON.stringify(value)).length).toBeLessThanOrEqual(SNAPSHOT_CHUNK_BYTES);
        values.set(key, structuredClone(value));
    }), delete: vi.fn(async (key: string) => { values.delete(key); }), keys: vi.fn(async () => [...values.keys()]) } };
    return { api, values };
}
describe("portable review snapshots", () => {
    it("captures exact versions, explicit unavailable members, notes and marks without restoring approval", async () => {
        let expected = snapshotFixture(), store = storage(), captured = expected.members[0];
        if (captured.state !== "captured") throw Error();
        let query = vi.fn().mockResolvedValue({ type: "data", value: captured.detail });
        let api: CaptureAPI = { ...store.api, query, reviews: vi.fn(async () => expected.capturedMarks), notes: { export: vi.fn(async () => expected.notes), list: vi.fn(async () => expected.capturedNotes) } };
        let actual = await capture(api, expected.session, expected.events, expected.session.members);
        expect(query).toHaveBeenCalledWith("query_revisions", { set: captured.detail.set });
        expect(actual.capturedMarks.changes[0].reviewed).toBe(1);
        expect(store.api.storage.set).not.toHaveBeenCalled();
        query.mockResolvedValue({ type: "data", value: { type: "NotFound", set: captured.detail.set } });
        expect((await capture(api, expected.session, expected.events, expected.session.members)).members[0].state).toBe("unavailable");
    });
    it("captures newer versions while retaining original session history and detects concurrent rewrites", async () => {
        let snapshot = snapshotFixture(), captured = snapshot.members[0];
        if (captured.state !== "captured") throw Error();
        let current = { ...captured.member, commitId: "456", description: "Rewritten change" };
        let detail = structuredClone(captured.detail); detail.headers[0].id.commit.hex = "456";
        let query = vi.fn().mockResolvedValue({ type: "data", value: detail });
        let api: CaptureAPI = { ...storage().api, query, reviews: vi.fn(async () => snapshot.capturedMarks), notes: { export: vi.fn(async () => snapshot.notes), list: vi.fn(async () => snapshot.capturedNotes) } };
        let result = await capture(api, snapshot.session, snapshot.events, [current]);
        expect(result.members[0].member.commitId).toBe("456");
        expect(result.session.members[0].commitId).toBe("123");
        query.mockResolvedValueOnce({ type: "data", value: captured.detail }).mockResolvedValueOnce({ type: "data", value: detail });
        await expect(capture(api, snapshot.session, snapshot.events, snapshot.session.members)).rejects.toThrow("changed during capture");
    });
    it("round trips captured content and reads the original gg.review v1 format", () => {
        let current = snapshotFixture(), legacy = legacyFixture();
        expect(parseSnapshot(stringifySnapshot(current))).toEqual(current);
        expect(parseSnapshot(JSON.stringify(legacy))).toEqual(legacy);
        legacy.threads[0].anchor = { kind: "line", file: "file", side: "additions", start: 1, end: 1, quote: "invented" };
        expect(() => parseSnapshot(JSON.stringify(legacy))).toThrow("captured source");
    });
    it("rejects ambiguous identities, mismatched source revisions and malformed patches", () => {
        let snapshot = snapshotFixture(); snapshot.events.push(snapshot.events[0]);
        expect(() => parseSnapshot(JSON.stringify(snapshot))).toThrow("Duplicate");
        snapshot = snapshotFixture(); snapshot.members[0].member.changeId = "other";
        expect(() => parseSnapshot(JSON.stringify(snapshot))).toThrow();
        snapshot = snapshotFixture(); if (snapshot.members[0].state === "captured") snapshot.members[0].detail.changes[0].hunks[0].location.to_file.len = 2;
        expect(() => parseSnapshot(JSON.stringify(snapshot))).toThrow("line counts");
        expect(() => parseSnapshot(JSON.stringify({ ...snapshotFixture(), version: 99 }))).toThrow("version");
    });
    it("chunks large Unicode and escaped content below 1 MiB and verifies each part", async () => {
        let snapshot = snapshotFixture(), member = snapshot.members[0];
        if (member.state !== "captured") throw Error();
        member.detail.changes[0].hunks[0].lines.lines[1] = `+${'"\\😀'.repeat(300_000)}\n`;
        let { api, values } = storage();
        await saveSnapshot(api, snapshot);
        expect(values.size).toBeGreaterThan(3);
        expect(await loadSnapshot(api, snapshot.id)).toEqual(snapshot);
        let calls = api.storage.set.mock.calls.length;
        await saveSnapshot(api, snapshot);
        expect(api.storage.set).toHaveBeenCalledTimes(calls);
        expect(await listSnapshots(api)).toEqual([{ id: "snapshot", title: "Portable review" }]);
        let part = [...values.keys()].find(key => key.startsWith("snapshot-part-"))!;
        values.set(part, { data: "damaged" });
        await expect(loadSnapshot(api, snapshot.id)).rejects.toThrow("damaged");
    });
    it("preserves an existing snapshot on ID collisions and hides partial writes", async () => {
        let original = snapshotFixture(), { api, values } = storage();
        await saveSnapshot(api, original);
        let conflicting = snapshotFixture(); conflicting.capturedAt = "2026-11-02T00:00:00Z";
        await expect(saveSnapshot(api, conflicting)).rejects.toThrow("preserved");
        expect(await loadSnapshot(api, original.id)).toEqual(original);
        let fresh = storage(); fresh.api.storage.set.mockImplementationOnce(async () => { throw Error("disk full"); });
        await expect(saveSnapshot(fresh.api, original)).rejects.toThrow("disk full");
        expect(await listSnapshots(fresh.api)).toEqual([]);
        expect(values.size).toBeGreaterThan(0);
    });
    it("preserves both payloads if concurrent writers use the same snapshot ID", async () => {
        let { api, values } = storage(), first = snapshotFixture(), second = snapshotFixture();
        second.capturedAt = "2026-11-02T00:00:00Z";
        let release!: () => void, barrier = new Promise<void>(resolve => release = resolve), waiting = 0;
        api.storage.set.mockImplementation(async (key, value) => {
            values.set(key, structuredClone(value));
            if (/^snapshot-[a-f0-9]{64}$/.test(key)) { if (++waiting === 2) release(); await barrier; }
        });
        let results = await Promise.allSettled([saveSnapshot(api, first), saveSnapshot(api, second)]);
        expect(results.every(result => result.status === "rejected")).toBe(true);
        expect([...values.keys()].filter(key => /^snapshot-[a-f0-9]{64}$/.test(key))).toHaveLength(2);
        await expect(loadSnapshot(api, first.id)).rejects.toThrow("Conflicting");
    });
    it("refuses incomplete manifests and notes from another review", async () => {
        let { api, values } = storage(), snapshot = snapshotFixture();
        await saveSnapshot(api, snapshot);
        values.delete([...values.keys()].find(key => key.startsWith("snapshot-part-"))!);
        await expect(loadSnapshot(api, snapshot.id)).rejects.toThrow();
        let invalid = { ...snapshotFixture(), notes: { format: "gg.annotation-bundle", version: 1, threads: [{ header: { id: "foreign", format: "gg.annotation", version: 1, created_at: "2026-11-01T00:00:00Z", author: { name: "Reviewer", kind: "human" }, contexts: [{ plugin: "review", id: "another-session" }] }, events: [] }] } };
        expect(() => parseSnapshot(JSON.stringify(invalid))).toThrow("another review");
    });
});
