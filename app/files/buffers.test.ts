import { describe, expect, it } from "vitest";
import { get } from "svelte/store";
import { createBuffers, dirtyPaths } from "./buffers";

let base = { text: "one\n", version: "v1" };

describe("file buffers", () => {
    it("keeps unsaved text per repository and path", () => {
        let buffers = createBuffers();
        buffers.edit("/repo", "a.txt", "two\n", base);
        buffers.edit("/other", "a.txt", "three\n", base);
        expect(buffers.get("/repo", "a.txt")).toEqual({ text: "two\n", version: "v1" });
        expect(buffers.get("/other", "a.txt")?.text).toBe("three\n");
        expect(buffers.get("/repo", "b.txt")).toBeUndefined();
        expect([...buffers.dirtyPaths("/repo")]).toEqual(["a.txt"]);
    });

    it("does not keep a clean buffer, and drops one that returns to its base", () => {
        let buffers = createBuffers();
        buffers.edit("/repo", "a.txt", "one\n", base);
        expect(buffers.get("/repo", "a.txt")).toBeUndefined();
        buffers.edit("/repo", "a.txt", "two\n", base);
        buffers.edit("/repo", "a.txt", "one\n", base);
        expect(buffers.get("/repo", "a.txt")).toBeUndefined();
        expect(get(buffers).size).toBe(0);
    });

    it("discards and clears", () => {
        let buffers = createBuffers();
        buffers.edit("/repo", "a.txt", "x", base);
        buffers.edit("/repo", "b.txt", "y", base);
        buffers.discard("/repo", "a.txt");
        expect([...buffers.dirtyPaths("/repo")]).toEqual(["b.txt"]);
        buffers.clear();
        expect(get(buffers).size).toBe(0);
    });

    it("notifies subscribers only when something changed", () => {
        let buffers = createBuffers();
        let seen = 0;
        buffers.subscribe(() => seen++);
        buffers.edit("/repo", "a.txt", "x", base);
        buffers.edit("/repo", "a.txt", "x", base);
        buffers.discard("/repo", "missing");
        expect(seen).toBe(2);
    });

    it("lists dirty paths of one scope from a snapshot", () => {
        let buffers = createBuffers();
        buffers.edit("/repo", "dir/a.txt", "x", base);
        buffers.edit("/repo2", "b.txt", "x", base);
        expect([...dirtyPaths(get(buffers), "/repo")]).toEqual(["dir/a.txt"]);
    });
});
