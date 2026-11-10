import { describe, expect, it } from "vitest";
import spriteUrl from "feather-icons/dist/feather-sprite.svg";
import { operationKind } from "./operationKind";

describe("operation kinds", () => {
    it.each([
        ["snapshot working copy", "neutral", "camera"],
        ["new empty commit", "create", "plus-circle"],
        ["commit 0123abcd", "create", "plus-circle"],
        ["duplicate 2 commits", "create", "plus-circle"],
        ["split commit abcdef", "create", "plus-circle"],
        ["describe commit abcdef", "rewrite", "edit-3"],
        ["squash commit abcdef", "rewrite", "edit-3"],
        ["rebase commit abc and descendants", "rewrite", "edit-3"],
        ["edit commit abcdef", "rewrite", "edit-3"],
        ["restore files", "rewrite", "edit-3"],
        ["absorb changes", "rewrite", "edit-3"],
        ["resolve conflicts", "rewrite", "edit-3"],
        ["parallelize 3 commits", "rewrite", "edit-3"],
        ["abandon commit abcdef", "remove", "trash-2"],
        ["forget bookmark main", "remove", "trash-2"],
        ["delete bookmark main", "remove", "trash-2"],
        ["untrack remote bookmark main@origin", "remove", "trash-2"],
        ["fetch from git remote(s) origin", "remote", "download-cloud"],
        ["push all bookmarks to git remote origin", "remote", "upload-cloud"],
        ["import git refs", "remote", "download-cloud"],
        ["export git refs", "remote", "upload-cloud"],
        ["track remote bookmark main@origin", "remote", "download-cloud"],
        ["undo operation 0123abcd", "undo", "rotate-ccw"],
        ["redo operation 0123abcd", "undo", "rotate-ccw"],
        ["restore to operation 0123abcd", "undo", "rotate-ccw"],
        ["revert operation 0123abcd", "undo", "rotate-ccw"],
        ["add workspace 'review'", "workspace", "at-sign"],
        ["check out commit abcdef", "workspace", "at-sign"],
        ["update working copy", "workspace", "at-sign"],
        ["rename workspace", "workspace", "at-sign"],
        ["reconcile divergent operations", "neutral", "circle"],
        ["", "neutral", "circle"],
    ])("classifies %j as %s", (description, tone, icon) => {
        let kind = operationKind(description);
        expect(kind.tone).toBe(tone);
        expect(kind.icon).toBe(icon);
        expect(kind.label.length).toBeGreaterThan(0);
    });
    it("ignores case and surrounding space, and uses only bundled feather icons", async () => {
        expect(operationKind("  Describe commit x ").tone).toBe("rewrite");
        let sprite = await (await fetch(spriteUrl)).text();
        for (let icon of ["camera", "plus-circle", "edit-3", "trash-2", "download-cloud", "upload-cloud", "rotate-ccw", "at-sign", "circle"]) expect(sprite).toContain(`id="${icon}"`);
    });
});
