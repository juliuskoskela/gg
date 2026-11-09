import { describe, expect, it } from "vitest";
import { personKey, project, queue, validateEvent, verdictFor, waitingFor, type ReviewEvent } from "./model";
let me = { name: "Reviewer", email: "me@example.com" };
let members = [{ changeId: "abc", commitId: "123", description: "First" }];
let created: ReviewEvent = { id: "create", at: "2026-11-01T00:00:00Z", type: "created", session: { id: "session", title: "Feature", createdAt: "2026-11-01T00:00:00Z", author: me, participants: [me], members } };
let approve: ReviewEvent = { id: "approve", at: "2026-11-02T00:00:00Z", type: "verdict", sessionId: "session", person: me, verdict: "approve", body: "", versions: members };
describe("review sessions", () => {
    it("pins verdicts to exact versions and never reuses approval after a rewrite", () => {
        let session = project([approve, created])[0];
        expect(verdictFor(session, me, new Map([["abc", "123"]]))?.stale).toBe(false);
        expect(waitingFor(session, me, new Map([["abc", "123"]]))).toBe(false);
        expect(waitingFor(session, me, new Map([["abc", "456"]]))).toBe(true);
        expect(waitingFor(session, me, new Map([["abc", null]]))).toBe(true);
    });
    it("replays a same-time creation before its verdict regardless of UUID sort order", () => {
        let decision = { ...approve, id: "a", at: created.at };
        let creation = { ...created, id: "z" };
        expect(project([decision, creation])[0].verdicts).toHaveLength(1);
    });
    it("records each participant independently, including comments that leave review pending", () => {
        let session = project([created, { ...approve, verdict: "comment" }])[0];
        expect(waitingFor(session, me, new Map([["abc", "123"]]))).toBe(true);
        expect(verdictFor(session, { name: "Other", email: "other@example.com" }, new Map())).toBe(null);
        expect(personKey({ name: "Changed display name", email: " ME@example.com " })).toBe(personKey(me));
    });
    it("applies split membership once per core receipt and invalidates earlier verdict", () => {
        let split: ReviewEvent = { id: "split", at: "2026-11-03T00:00:00Z", type: "members", sessionId: "session", receiptId: "receipt", source: members[0], members: [...members, { changeId: "def", commitId: "456", description: "Remainder" }] };
        let session = project([created, approve, split, { ...split, id: "duplicate" }])[0];
        expect(session.members).toHaveLength(2);
        expect(session.receipts).toEqual(["receipt"]);
        expect(project([created, approve, split], { receipt: "inactive" })[0].members).toEqual(members);
        expect(project([created, approve, split], { receipt: "unknown" })[0].members).toHaveLength(2);
        expect(verdictFor(session, me, new Map([["abc", "123"], ["def", "456"]]))?.stale).toBe(true);
    });
    it("projects independent member splits without replacing unrelated members", () => {
        let second = { changeId: "def", commitId: "456", description: "Second" };
        let creation = { ...created, session: { ...created.session, members: [...members, second] } };
        let firstSplit: ReviewEvent = { id: "split-a", at: "2026-11-03T00:00:00Z", type: "members", sessionId: "session", source: members[0], receiptId: "a", members: [...members, { changeId: "ghi", commitId: "789", description: "First remainder" }] };
        let secondSplit: ReviewEvent = { id: "split-b", at: "2026-11-04T00:00:00Z", type: "members", sessionId: "session", source: second, receiptId: "b", members: [second, { changeId: "jkl", commitId: "abc", description: "Second remainder" }] };
        expect(project([creation, firstSplit, secondSplit])[0].members.map(member => member.changeId)).toEqual(["abc", "ghi", "def", "jkl"]);
    });
    it("sorts pending sessions by remaining personal files with unknown totals last", () => {
        let sessions = project([created, { ...created, id: "second", session: { ...created.session, id: "second", members: [{ changeId: "def", commitId: "456", description: "Second" }] } }]);
        let progress = { me, location: "", changes: [{ change_id: "def", commit_id: "456", reviewed_commit_id: null, state: "changed" as const, total: 3, reviewed: 2, files: [] }] };
        expect(queue(sessions, me, new Map(), progress).map(session => session.id)).toEqual(["second", "session"]);
    });
    it("rejects malformed imported event shapes and ambiguous membership", () => {
        validateEvent(created);
        expect(() => validateEvent({ ...created, session: { ...created.session, members: [...members, ...members] } })).toThrow();
        expect(() => validateEvent({ ...approve, verdict: "maybe" })).toThrow();
        expect(() => validateEvent({ ...approve, at: "invalid" })).toThrow();
    });
});
