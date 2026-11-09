import { afterEach, beforeEach, expect, it } from "vitest";
import { waitFor } from "@testing-library/svelte";
import { cleanupMocks, setupMocks } from "../mocks";
import type { RevId } from "../messages/RevId";

let requested: string[];
let release: Map<string, () => void>;
let incomplete: boolean;
function id(hex: string): RevId {
    return { change: { type: "ChangeId", hex, prefix: hex, rest: "", is_divergent: false, offset: null }, commit: { type: "CommitId", hex, prefix: hex, rest: "" } };
}

beforeEach(() => {
    requested = []; release = new Map(); incomplete = false;
    setupMocks((command, args) => {
        if (command !== "query_revision_summary") return;
        let set = args.set as { from: RevId; to: RevId };
        requested.push(set.from.commit.hex);
        return new Promise(resolve => release.set(set.from.commit.hex, () => resolve({ type: "Detail", set, headers: [], parents: [], conflicts: [], changes: [{ category: "Test", kind: "Added", path: { repo_path: "test.rs", relative_path: "test.rs" }, has_conflict: false, stat: incomplete ? null : { added: 5, removed: 0 } }] })));
    });
});
afterEach(async () => { release.forEach(resolve => resolve()); await cleanupMocks(); });

it("limits in-flight summaries and reuses exact-commit results", async () => {
    let { timelineStats } = await import("./timelineStats");
    let first = timelineStats("repo", id("one"));
    let second = timelineStats("repo", id("two"));
    let third = timelineStats("repo", id("three"));
    await waitFor(() => expect(requested).toHaveLength(2));
    release.get("one")!();
    await first;
    await waitFor(() => expect(requested).toHaveLength(3));
    release.forEach(resolve => resolve());
    await Promise.all([second, third]);
    expect(await timelineStats("repo", id("one"))).toHaveLength(1);
    expect(requested).toHaveLength(3);
});

it("never supplies partial totals when a file has no line statistics", async () => {
    incomplete = true;
    let { timelineStats } = await import("./timelineStats");
    let result = timelineStats("incomplete-repo", id("one"));
    await waitFor(() => expect(release.size).toBe(1));
    release.get("one")!();
    expect(await result).toBeNull();
});

it("skips abandoned queued rows and lets a later visit request them again", async () => {
    let { timelineStats } = await import("./timelineStats");
    let first = timelineStats("scroll", id("one"));
    let second = timelineStats("scroll", id("two"));
    let controller = new AbortController();
    let discarded = timelineStats("scroll", id("later"), controller.signal);
    controller.abort();
    expect(await discarded).toBeNull();
    await waitFor(() => expect(requested).toHaveLength(2));
    release.forEach(resolve => resolve());
    await Promise.all([first, second]);
    expect(requested).toEqual(expect.arrayContaining(["one", "two"]));
    expect(requested).not.toContain("later");
    let revisit = timelineStats("scroll", id("later"));
    await waitFor(() => expect(requested).toContain("later"));
    release.get("later")!();
    expect(await revisit).toHaveLength(1);
});

it("keeps a shared request when one consumer leaves", async () => {
    let { timelineStats } = await import("./timelineStats");
    let controller = new AbortController();
    let first = timelineStats("shared", id("one"), controller.signal);
    let second = timelineStats("shared", id("one"));
    controller.abort();
    expect(await first).toBeNull();
    await waitFor(() => expect(requested).toEqual(["one"]));
    release.get("one")!();
    expect(await second).toHaveLength(1);
});
