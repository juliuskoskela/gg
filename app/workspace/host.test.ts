import { afterEach, describe, expect, it } from "vitest";
import { get } from "svelte/store";
import OperationView from "./OperationView.svelte";
import { workspaceViews } from "./views";
import { createWorkspaceController, readToolLayout } from "./state";

let original = location.href;
afterEach(() => {
    workspaceViews.splice(3);
    localStorage.removeItem("gg.workspace.layout");
    history.replaceState(null, "", original);
});
function addView(id: string) {
    workspaceViews.push({ id, label: id, scope: "repository", placement: "picker", desktop: "tab", mobile: "full", component: OperationView });
}

describe("adaptive tool host state", () => {
    it("bounds tabs, restores a validated layout and leaves inspection intact", () => {
        for (let id of ["one", "two", "three"]) addView(id);
        let controller = createWorkspaceController();
        controller.openView("operation", false);
        controller.openView("one", false);
        controller.openView("two", false);
        controller.openView("three", false);
        expect(get(controller).toolTabs).toEqual(["one", "two", "three"]);
        controller.closeTab("three");
        expect(get(controller).activeTool).toBe("two");
        controller.closeView(false);
        expect(get(createWorkspaceController())).toMatchObject({ toolTabs: ["one", "two"], activeTool: null });
        controller.setGraphFraction(0.4);
        controller.resetLayout();
        expect(get(controller)).toMatchObject({ toolTabs: [], activeTool: null, graphFraction: 0.4 });
        expect(readToolLayout('{"version":2,"tabs":["one"]}')).toEqual({ tabs: [], active: null });
        expect(readToolLayout('{"version":1,"tabs":["unknown","one","one"],"active":"one"}')).toEqual({ tabs: ["one"], active: "one" });
    });
    it("replaces sibling compact destinations and keeps the inspection URL", () => {
        addView("one");
        history.replaceState(null, "", "/?inspect=abc&file=src%2Fa.ts");
        let controller = createWorkspaceController();
        let stop = controller.start();
        controller.openView("operation", true);
        let before = history.length;
        controller.openView("one", true);
        expect(history.length).toBe(before);
        expect(new URL(location.href).searchParams.get("view")).toBe("one");
        expect(new URL(location.href).searchParams.get("inspect")).toBe("abc");
        expect(get(controller).inspector?.activeFilePath).toBe("src/a.ts");
        let restored = createWorkspaceController();
        let stopRestored = restored.start();
        expect(get(restored)).toMatchObject({ routedTool: "one", presentation: "full" });
        stopRestored();
        stop();
    });
    it("returns to the exact inspector on browser Back after switching compact tools", async () => {
        addView("one");
        history.replaceState(null, "", "/?inspect=abc&inspectFrom=def&file=a.ts");
        let controller = createWorkspaceController();
        let stop = controller.start();
        controller.openView("operation", true);
        controller.openView("one", true);
        let popped = new Promise<void>(resolve => window.addEventListener("popstate", () => resolve(), { once: true }));
        history.back();
        await popped;
        expect(get(controller)).toMatchObject({ routedTool: null, presentation: "full", inspector: { revset: "abc", fromRevset: "def", activeFilePath: "a.ts" } });
        stop();
    });

    it("preserves the active tool across rotation without stacking history entries", async () => {
        history.replaceState(null, "", "/?inspect=abc&file=a.ts");
        let controller = createWorkspaceController();
        let stop = controller.start();
        controller.openView("operation", false);
        controller.adaptViewport(true);
        expect(get(controller)).toMatchObject({ activeTool: "operation", routedTool: "operation", inspector: { activeFilePath: "a.ts" } });
        expect(new URL(location.href).searchParams.get("view")).toBe("operation");
        let afterOpen = history.length;
        controller.adaptViewport(false);
        addView("sibling");
        controller.openView("sibling", false);
        expect(new URL(location.href).searchParams.get("view")).toBe("sibling");
        controller.adaptViewport(true);
        controller.adaptViewport(false);
        expect(history.length).toBe(afterOpen);
        expect(get(controller)).toMatchObject({ activeTool: "sibling", routedTool: "sibling" });
        let popped = new Promise<void>(resolve => window.addEventListener("popstate", () => resolve(), { once: true }));
        history.back();
        await popped;
        expect(get(controller)).toMatchObject({ activeTool: null, routedTool: null, inspector: { revset: "abc", activeFilePath: "a.ts" } });
        expect(get(createWorkspaceController()).activeTool).toBeNull();
        stop();
    });
    it("moves a compact destination into a desktop tab and retains its route", () => {
        history.replaceState(null, "", "/?inspect=abc&view=operation");
        let controller = createWorkspaceController();
        let stop = controller.start();
        controller.adaptViewport(false);
        expect(get(controller)).toMatchObject({ activeTool: "operation", routedTool: "operation", toolTabs: ["operation"] });
        expect(new URL(location.href).searchParams.get("view")).toBe("operation");
        stop();
    });

});
