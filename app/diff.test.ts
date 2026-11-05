import { describe, expect, it } from "vitest";
import { parsePatchFiles } from "@pierre/diffs";
import { changePatch } from "./diff";
import type { RevChange } from "./messages/RevChange";

describe("GG patch adapter", () => {
    it("preserves offsets, literal code and missing final newlines with unusual paths", () => {
        let change: RevChange = {
            kind: "Modified", has_conflict: false,
            path: { repo_path: "src/a\n+++ forged.ts", relative_path: "src/a\n+++ forged.ts" },
            hunks: [{ location: { from_file: { start: 42, len: 2 }, to_file: { start: 42, len: 2 } }, lines: { lines: [" const value = '<script>';\n", "-let old = 1;\n", "+let next = 2;"] } }],
        };
        let parsed = parsePatchFiles(changePatch(change));
        expect(parsed).toHaveLength(1);
        expect(parsed[0].files).toHaveLength(1);
        let file = parsed[0].files[0];
        expect(file.hunks[0].additionStart).toBe(42);
        expect(file.additionLines.join("")).toContain("<script>");
        expect(file.additionLines.join("")).toContain("let next = 2;");
        expect(changePatch(change)).toContain("\\ No newline at end of file");
    });

    it.each(["Added", "Deleted"] as const)("parses %s files with an empty opposite side", kind => {
        let change: RevChange = { kind, has_conflict: false, path: { repo_path: "a.ts", relative_path: "a.ts" }, hunks: [{ location: { from_file: { start: 1, len: kind === "Added" ? 0 : 1 }, to_file: { start: 1, len: kind === "Deleted" ? 0 : 1 } }, lines: { lines: [kind === "Added" ? "+hello\n" : "-hello\n"] } }] };
        let file = parsePatchFiles(changePatch(change))[0].files[0];
        expect(file.type).toBe(kind === "Added" ? "new" : "deleted");
    });
});
