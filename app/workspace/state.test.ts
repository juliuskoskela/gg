import { describe, expect, it } from "vitest";
import { get } from "svelte/store";
import type { RevSet } from "../messages/RevSet";
import { clampGraphFraction, createWorkspaceController, present, selectRevision, type WorkspaceState } from "./state";

function revision(commit: string, change = "change"): RevSet {
    let id = { commit: { type: "CommitId" as const, hex: commit, prefix: commit, rest: "" }, change: { type: "ChangeId" as const, hex: change, prefix: change, rest: "", offset: null, is_divergent: false } };
    return { from: id, to: id };
}
function initial(): WorkspaceState {
    return { repository: "repo", inspector: null, presentation: "closed", returnPresentation: "half", graphFraction: 0.25, toolTabs: [], activeTool: null, routedTool: null };
}

describe("workspace transitions", () => {
    it("opens explicit selection at half with exact identity and retains available file", () => {
        let state = selectRevision(initial(), revision("commit-1"));
        state.inspector!.activeFilePath = "a.txt";
        state = selectRevision(state, revision("commit-2"), ["a.txt"]);
        expect(state.presentation).toBe("half");
        expect(state.inspector).toMatchObject({ revset: "commit-2", activeFilePath: "a.txt", selection: revision("commit-2") });
        expect(selectRevision(state, revision("commit-3"), ["b.txt"]).inspector?.activeFilePath).toBeNull();
    });
    it("remembers the prior shelf when expanding and clears context when closed", () => {
        let state = selectRevision(initial(), revision("a"));
        state = present(state, "collapsed");
        state = present(state, "full");
        expect(state.returnPresentation).toBe("collapsed");
        expect(present(state, "closed").inspector).toBeNull();
        expect(present(initial(), "half").presentation).toBe("closed");
    });
    it("reconciles without reopening and resets when repository changes", () => {
        let controller = createWorkspaceController();
        controller.setRepository("one");
        controller.selectRevision(revision("a"));
        controller.setFile("a.txt");
        controller.setPresentation("collapsed");
        controller.reconcileSelection(revision("b"), ["b.txt"]);
        expect(get(controller)).toMatchObject({ presentation: "collapsed", inspector: { revset: "b", activeFilePath: null } });
        controller.setRepository("two");
        expect(get(controller)).toMatchObject({ presentation: "closed", inspector: null });
    });
    it("restores the exact file after a rewrite is undone without sharing divergent state", () => {
        let controller = createWorkspaceController();
        controller.setRepository("one");
        controller.selectRevision(revision("before"));
        controller.setFile("removed.txt");
        controller.reconcileSelection(revision("after"), ["other.txt"]);
        expect(get(controller).inspector?.activeFilePath).toBeNull();
        controller.setFile("other.txt");
        controller.reconcileSelection(revision("before"), ["removed.txt", "other.txt"]);
        expect(get(controller).inspector?.activeFilePath).toBe("removed.txt");
        controller.setRepository("two");
        controller.selectRevision(revision("before"));
        expect(get(controller).inspector?.activeFilePath).toBeNull();
    });
    it("serializes both ends of a range for full inspection and restores them from the URL", () => {
        let original = location.href;
        history.replaceState(null, "", "/");
        let controller = createWorkspaceController();
        let cleanup = controller.start();
        let range = { from: revision("first").from, to: revision("last").to };
        controller.selectRevision(range);
        controller.setPresentation("full");
        expect(new URL(location.href).searchParams.get("inspect")).toBe("last");
        expect(new URL(location.href).searchParams.get("inspectFrom")).toBe("first");
        cleanup();
        let restored = createWorkspaceController();
        let stop = restored.start();
        expect(get(restored).inspector).toMatchObject({ revset: "last", fromRevset: "first", selection: null });
        stop();
        history.replaceState(null, "", original);
    });
    it("clamps malformed and extreme graph preferences", () => {
        expect(clampGraphFraction(NaN)).toBe(0.25);
        expect(clampGraphFraction(-1)).toBe(0.1);
        expect(clampGraphFraction(2)).toBe(0.8);
    });
    it("loads a deep link and preserves it during initial repository assignment", () => {
        let original = location.href;
        history.replaceState(null, "", "/?inspect=abc&file=src%2Fa.ts");
        let controller = createWorkspaceController();
        let cleanup = controller.start();
        controller.setRepository("one");
        expect(get(controller)).toMatchObject({ presentation: "full", inspector: { revset: "abc", activeFilePath: "src/a.ts" } });
        controller.back();
        expect(get(controller).presentation).toBe("half");
        expect(location.search).toBe("");
        cleanup();
        history.replaceState(null, "", original);
    });
});
