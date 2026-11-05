import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fireEvent, render, waitFor } from "@testing-library/svelte";
import { setupMocks, cleanupMocks } from "../mocks";

beforeAll(() => setupMocks(() => undefined));
afterAll(async () => cleanupMocks());

describe("registered tool host", () => {
    it("hosts a newly registered view, hides and restores it without shell branches", async () => {
        let { workspaceViews } = await import("./views");
        let { workspaceController } = await import("./state");
        let { default: OperationView } = await import("./OperationView.svelte");
        let { default: WorkspaceTools } = await import("./WorkspaceTools.svelte");
        workspaceController.resetLayout();
        workspaceViews.push({ id: "test-tool", label: "Test tool", scope: "repository", placement: "picker", desktop: "tab", mobile: "full", component: OperationView });
        let rendered = render(WorkspaceTools, { props: { compact: false, onHistory: () => {}, onInspect: () => {} } });
        window.dispatchEvent(new CustomEvent("gg:open-view", { detail: "test-tool" }));
        await waitFor(() => expect(rendered.getByRole("button", { name: "Test tool" }).getAttribute("aria-current")).toBe("page"));
        await fireEvent.click(rendered.getByRole("button", { name: "Hide tools" }));
        await fireEvent.click(rendered.getByRole("button", { name: "Restore tools" }));
        expect(rendered.getByRole("button", { name: "Test tool" }).getAttribute("aria-current")).toBe("page");
        await fireEvent.click(rendered.getByRole("button", { name: "Close active tool" }));
        expect(rendered.queryByRole("button", { name: "Test tool" })).toBeNull();
        rendered.unmount();
        workspaceViews.pop();
        workspaceController.resetLayout();
    });
    it("renders the same registered component as a compact destination", async () => {
        let { workspaceViews } = await import("./views");
        let { workspaceController } = await import("./state");
        let { default: OperationView } = await import("./OperationView.svelte");
        let { default: WorkspaceTools } = await import("./WorkspaceTools.svelte");
        let original = location.href;
        history.replaceState(null, "", "/");
        workspaceController.resetLayout();
        workspaceViews.push({ id: "test-mobile", label: "Test mobile", scope: "repository", placement: "picker", desktop: "tab", mobile: "full", component: OperationView });
        let rendered = render(WorkspaceTools, { props: { compact: true, onHistory: () => {}, onInspect: () => {} } });
        window.dispatchEvent(new CustomEvent("gg:open-view", { detail: "test-mobile" }));
        await waitFor(() => expect(rendered.getByRole("heading", { name: "Test mobile" })).toBeTruthy());
        expect(new URL(location.href).searchParams.get("view")).toBe("test-mobile");
        await fireEvent.click(rendered.getByRole("button", { name: "Back from repository tool" }));
        expect(rendered.queryByRole("heading", { name: "Test mobile" })).toBeNull();
        rendered.unmount();
        workspaceViews.pop();
        workspaceController.resetLayout();
        history.replaceState(null, "", original);
    });

});
