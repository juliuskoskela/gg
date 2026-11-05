import { describe, expect, it } from "vitest";
import type { RevHeader } from "../messages/RevHeader";
import { revisionCapabilities } from "./revisionActions";

function header(options: Partial<RevHeader> = {}): RevHeader {
    return { parent_ids: [{ type: "CommitId", hex: "parent", prefix: "p", rest: "arent" }], is_immutable: false, is_working_copy: false, ...options } as RevHeader;
}

describe("revision capabilities", () => {
    it("protects every immutable revision in a range while allowing non-mutating creation", () => {
        let result = revisionCapabilities([header(), header({ is_immutable: true }), header()]);
        expect(result.squash).toBe(false);
        expect(result.abandon).toBe(false);
        expect(result.new_child).toBe(true);
        expect(result.duplicate).toBe(true);
        expect(revisionCapabilities([header({ is_immutable: true })], true).squash).toBe(true);
    });
    it("limits parent operations to a single parent and edit to another single revision", () => {
        expect(revisionCapabilities([header({ parent_ids: [] })]).restore).toBe(false);
        expect(revisionCapabilities([header({ is_working_copy: true })]).edit).toBe(false);
        expect(revisionCapabilities([header(), header()]).restore).toBe(false);
        expect(revisionCapabilities([header(), header()]).squash).toBe(true);
    });
});
