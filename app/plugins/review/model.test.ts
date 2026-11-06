import { describe, expect, it } from "vitest";
import { createReview, isSeen, lineAnchor, mergeReview, parseReview, threadStatus, uid, type Anchor, type Review } from "./model";
import { detail, change, other } from "./test/fixture";
let author = { id: "avery", name: "Avery" };
function make() { return createReview(detail, [change, other], "Scheduler review", "gg-plus", author, "change"); }
function json(review: Review) { return JSON.stringify(review); }
describe("portable review contract", () => {
    it("pins each comment scope to exact captured membership and permits all four target types", () => {
        for (let kind of ["revision", "change", "revset"] as const) {
            let review = createReview(detail, [change], "Review", "Repo", author, kind);
            let anchor = lineAnchor(review.snapshot.files[0], { side: "additions", start: 3, end: 5 });
            expect(anchor.quote).toBe("  let frontier = ready.sort(byPriority);\n  if (!frontier.length) return [];\n  return frontier.map(task => task.run());\n");
            for (let target of [review.subject, anchor]) review.threads.push({ id: uid(), anchor: target, posts: [{ id: uid(), author, at: review.createdAt, body: "Please preserve ordering." }], events: [] });
            expect(parseReview(json(review))).toEqual(review);
        }
    });
    it("freezes a selected range as an exact revset without losing either endpoint", () => {
        let range = structuredClone(detail);
        let older = structuredClone(range.headers[0]); older.id.commit.hex = "0123456789ab"; older.id.change.hex = "olderchange";
        range.headers.push(older); range.set.from = older.id;
        let review = createReview(range, [change], "Stack review", "Repo", author, "revset");
        expect(review.subject).toEqual({ kind: "revset", expression: "abcdef123456 | 0123456789ab", commits: ["abcdef123456", "0123456789ab"] });
        expect(review.snapshot.from.commit.hex).toBe("0123456789ab");
        expect(() => createReview(range, [change], "Stack review", "Repo", author, "change")).toThrow("Revset");
    });
    it("anchors old-side deletions independently and rejects cross-side or uncaptured selections", () => {
        let review = make(), file = review.snapshot.files[0];
        expect(lineAnchor(file, { side: "deletions", start: 3, end: 3 }).quote).toBe("  return ready;\n");
        expect(() => lineAnchor(file, { side: "deletions", endSide: "additions", start: 3, end: 4 })).toThrow("one side");
        expect(() => lineAnchor(file, { start: 1, end: 5000 })).toThrow();
        expect(() => lineAnchor(file, { start: 30, end: 31 })).toThrow();
    });
    it("merges returned discussions without losing concurrent replies, resolution or seen events", () => {
        let review = make(); review.threads.push({ id: "thread", anchor: review.subject, posts: [{ id: "root", author, at: review.createdAt, body: "Can we keep ordering stable?" }], events: [] });
        let a = structuredClone(review), b = structuredClone(review);
        a.threads[0].posts.push({ id: "reply-a", author, at: "2026-11-07T01:00:00Z", body: "Yes." });
        b.threads[0].posts.push({ id: "reply-b", author: { id: "blair", name: "Blair" }, at: "2026-11-07T01:01:00Z", body: "Added a regression test." });
        b.threads[0].events.push({ id: "status", author, at: "2026-11-07T02:00:00Z", status: "resolved" });
        b.seen.push({ id: "seen", author, at: b.createdAt, file: b.snapshot.files[0].id, seen: true });
        let merged = mergeReview(a, b);
        expect(merged.threads[0].posts).toHaveLength(3); expect(threadStatus(merged.threads[0])).toBe("resolved"); expect(isSeen(merged, merged.snapshot.files[0].id, "avery")).toBe(true);
        expect(isSeen(merged, merged.snapshot.files[0].id, "blair")).toBe(false);
        expect(mergeReview(merged, b)).toEqual(merged);
    });
    it("does not carry seen marks to another captured version", () => {
        let old = make(), next = make(); old.seen.push({ id: "seen", author, at: old.createdAt, file: old.snapshot.files[0].id, seen: true });
        expect(isSeen(next, next.snapshot.files[0].id, author.id)).toBe(false);
    });
    it("preserves existing data when an imported review reuses an ID with different content", () => {
        let original = make(); let changed = structuredClone(original); changed.snapshot.files[0].change.path.repo_path = "changed.ts";
        expect(() => mergeReview(original, changed)).toThrow("different snapshot");
        original.threads.push({ id: "thread", anchor: original.subject, posts: [{ id: "post", author, at: original.createdAt, body: "Original" }], events: [] });
        changed = structuredClone(original); changed.threads[0].posts[0].body = "Overwritten";
        expect(() => mergeReview(original, changed)).toThrow("conflicting event IDs");
        expect(original.threads[0].posts[0].body).toBe("Original");
    });
    it("validates imported patches, references, versions, event identities and quotes before rendering", () => {
        let review = make(); let file = review.snapshot.files[0];
        review.threads.push({ id: "thread", anchor: lineAnchor(file, { side: "additions", start: 3, end: 3 }), posts: [{ id: "p", author, at: review.createdAt, body: "<img src=x onerror=alert(1)>" }], events: [] });
        expect(parseReview(json(review)).threads[0].posts[0].body).toContain("<img");
        for (let mutate of [
            (r: any) => r.version = 99,
            (r: any) => r.snapshot.files[0].change.hunks[0].location.to_file.len = 50,
            (r: any) => r.threads[0].anchor.quote = "fabricated",
            (r: any) => r.threads[0].anchor.file = "absent",
            (r: any) => r.threads[0].posts[0].at = "not a time",
            (r: any) => r.threads.push(r.threads[0]),
            (r: any) => r.seen.push({ id: "s", author, at: r.createdAt, file: "absent", seen: true }),
        ]) { let invalid = structuredClone(review); mutate(invalid); expect(() => parseReview(json(invalid))).toThrow(); }
        expect(() => parseReview(" ".repeat(10 * 1024 * 1024 + 1))).toThrow("10 MB");
    });
});
