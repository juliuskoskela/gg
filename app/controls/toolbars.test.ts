import { describe, expect, it } from "vitest";
import { get } from "svelte/store";
import type { Snippet } from "svelte";
import { createToolbarRegistry } from "./toolbars";

let content = (() => {}) as unknown as Snippet;

describe("toolbar contributions", () => {
    it("keeps sibling contributions and scopes cleanup to the registering handle", () => {
        let registry = createToolbarRegistry();
        let first = registry.contribute("diff"), second = registry.contribute("diff");
        first.update(content); second.update(content);
        expect(get(registry).get("diff")).toHaveLength(2);
        first.dispose();
        expect(get(registry).get("diff")?.map(entry => entry.id)).toEqual([1]);
        first.update(content);
        expect(get(registry).get("diff")).toHaveLength(1);
        second.dispose();
        expect(get(registry).has("diff")).toBe(false);
    });

    it("preserves registration order through replacement and local rendering", () => {
        let registry = createToolbarRegistry();
        let first = registry.contribute("diff"), second = registry.contribute("diff");
        first.update(content); second.update(content);
        first.update(undefined); first.update(content);
        expect(get(registry).get("diff")?.map(entry => entry.id)).toEqual([0, 1]);
        let other = registry.contribute("history"); other.update(content);
        second.dispose();
        expect(get(registry).get("history")).toHaveLength(1);
    });
});
