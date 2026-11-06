import { afterEach, describe, expect, it, vi } from "vitest";
import { render, fireEvent, waitFor } from "@testing-library/svelte";
import { get } from "svelte/store";
import { setupMocks, cleanupMocks } from "../mocks";
import type { RepoConfig } from "../messages/RepoConfig";
import type { WorkspaceContext } from "../messages/WorkspaceContext";
import "../global.css";

let shell: HTMLDivElement;
let workspace = { type: "Workspace", absolute_path: "/work/cortex" } as Extract<RepoConfig, { type: "Workspace" }>;
let context: WorkspaceContext = { project_name: "cortex", workspace_name: "review", repo_path: "/work/cortex", workspace_path: "/work/cortex", workspaces: [{ name: "review", path: "/work/cortex" }, { name: "default", path: "/work/main" }, { name: "unavailable" }] };

afterEach(async () => { await cleanupMocks(); vi.restoreAllMocks(); vi.unstubAllGlobals(); shell?.remove(); });

async function mount() {
    let { default: PlaceMenu } = await import("./PlaceMenu.svelte");
    let { repoConfigEvent } = await import("../stores");
    repoConfigEvent.set(workspace);
    shell = document.createElement("div"); shell.id = "shell"; shell.className = "dark"; document.body.append(shell);
    return render(PlaceMenu, { target: shell, props: { workspace } });
}

describe("repository identity navigation", () => {
    it("opens one coherent menu with native actions, current workspaces, and deduplicated recent locations", async () => {
        let calls: string[] = [];
        setupMocks(command => {
            if (command === "query_workspace_context") return context;
            if (command === "query_recent_workspaces") return ["/work/cortex", "/work/other", "/work/other"];
            if (command === "forward_accelerator") calls.push(command);
        });
        let { findByRole, getByRole, getAllByRole, container } = await mount();
        let identity = await findByRole("button", { name: "Repository navigation: review@cortex" });
        expect(container.querySelectorAll(".place-button")).toHaveLength(1);
        expect(container.querySelector(".alternate-workspace")?.textContent).toBe("review");
        await fireEvent.click(identity);
        expect(getByRole("dialog", { name: "Repository navigation" })).toBeTruthy();
        expect((getByRole("button", { name: "unavailable Path not recorded" }) as HTMLButtonElement).disabled).toBe(true);
        expect(getByRole("button", { name: "review Current /work/cortex" }).getAttribute("aria-current")).toBe("page");
        await findByRole("button", { name: "other /work/other" });
        expect(getAllByRole("button", { name: "other /work/other" })).toHaveLength(1);
        expect(getByRole("button", { name: /^Open repository…/ })).toBe(document.activeElement);
        expect(getByRole("button", { name: /^Clone repository…/ })).toBeTruthy();
        expect(getByRole("button", { name: /^Reopen repository/ })).toBeTruthy();
        await fireEvent.click(getByRole("button", { name: /^Initialize repository…/ }));
        await waitFor(() => expect(calls).toEqual(["forward_accelerator"]));
        expect(document.activeElement).toBe(identity);
    });

    it("supports arrow opening, wrapping, Home, End, Escape, and outside dismissal", async () => {
        setupMocks(command => command === "query_workspace_context" ? context : []);
        let { findByRole, getByRole, queryByRole } = await mount();
        let identity = await findByRole("button", { name: "Repository navigation: review@cortex" });
        identity.focus();
        await fireEvent.keyDown(identity, { key: "ArrowUp" });
        let close = getByRole("button", { name: "Close window" });
        await waitFor(() => expect(document.activeElement).toBe(close));
        await fireEvent.keyDown(close, { key: "ArrowDown" });
        expect(document.activeElement?.textContent).toContain("Open repository…");
        await fireEvent.keyDown(document.activeElement!, { key: "End" });
        expect(document.activeElement).toBe(close);
        await fireEvent.keyDown(close, { key: "Home" });
        expect(document.activeElement?.textContent).toContain("Open repository…");
        await fireEvent.keyDown(document.activeElement!, { key: "ArrowUp" });
        expect(document.activeElement).toBe(close);
        await fireEvent.keyDown(close, { key: "Escape" });
        expect(queryByRole("dialog")).toBeNull();
        expect(document.activeElement).toBe(identity);
        await fireEvent.click(identity);
        await fireEvent.pointerDown(document.body);
        expect(queryByRole("dialog")).toBeNull();
        await fireEvent.click(identity);
        await fireEvent.focusIn(document.body);
        expect(queryByRole("dialog")).toBeNull();
    });

    it("opens a named workspace and ignores stale navigation results after repository changes", async () => {
        let resolve: (value: RepoConfig) => void;
        let calls: unknown[] = [];
        setupMocks((command, args) => {
            if (command === "query_workspace_context") return context;
            if (command === "query_recent_workspaces") return [];
            if (command === "query_workspace") { calls.push(args); return new Promise<RepoConfig>(done => resolve = done); }
        });
        let { findByRole, getByRole } = await mount();
        let { repoConfigEvent } = await import("../stores");
        await fireEvent.click(await findByRole("button", { name: "Repository navigation: review@cortex" }));
        await fireEvent.click(getByRole("button", { name: "default /work/main" }));
        await waitFor(() => expect(calls).toEqual([{ path: "/work/main" }]));
        let replacement = { ...workspace, absolute_path: "/work/new" };
        repoConfigEvent.set(replacement);
        resolve!({ ...workspace, absolute_path: "/work/main" });
        let { wait } = await import("../ipc"); await wait();
        expect(get(repoConfigEvent)).toBe(replacement);
    });

    it("opens a recent workspace through the repository query", async () => {
        setupMocks((command, args) => command === "query_workspace_context" ? context : command === "query_recent_workspaces" ? ["/work/other"] : command === "query_workspace" ? { ...workspace, absolute_path: args.path } : undefined);
        let { findByRole } = await mount();
        let { repoConfigEvent } = await import("../stores");
        await fireEvent.click(await findByRole("button", { name: "Repository navigation: review@cortex" }));
        await fireEvent.click(await findByRole("button", { name: "other /work/other" }));
        await waitFor(() => expect(get(repoConfigEvent)).toMatchObject({ absolute_path: "/work/other" }));
    });

    it("discards recent results from a closed menu", async () => {
        let responses: ((paths: string[]) => void)[] = [];
        setupMocks(command => command === "query_workspace_context" ? context : command === "query_recent_workspaces" ? new Promise<string[]>(resolve => responses.push(resolve)) : undefined);
        let { findByRole, queryByRole } = await mount();
        let identity = await findByRole("button", { name: "Repository navigation: review@cortex" });
        await fireEvent.click(identity);
        await waitFor(() => expect(responses).toHaveLength(1));
        await fireEvent.click(identity);
        await fireEvent.click(identity);
        await waitFor(() => expect(responses).toHaveLength(2));
        responses[1](["/work/current-recent"]);
        await findByRole("button", { name: "current-recent /work/current-recent" });
        responses[0](["/work/stale"]);
        let { wait } = await import("../ipc"); await wait();
        expect(queryByRole("button", { name: "stale /work/stale" })).toBeNull();
    });

    it("discards context responses after a workspace prop changes", async () => {
        let responses: ((value: WorkspaceContext) => void)[] = [];
        setupMocks(command => command === "query_workspace_context" ? new Promise<WorkspaceContext>(resolve => responses.push(resolve)) : []);
        let { rerender, findByRole, queryByRole } = await mount();
        await waitFor(() => expect(responses).toHaveLength(1));
        await rerender({ workspace: { ...workspace, absolute_path: "/work/new" } });
        await waitFor(() => expect(responses).toHaveLength(2));
        responses[1]({ ...context, project_name: "new" });
        await findByRole("button", { name: "Repository navigation: review@new" });
        responses[0](context);
        let { wait } = await import("../ipc"); await wait();
        expect(queryByRole("button", { name: "Repository navigation: review@cortex" })).toBeNull();
    });

    it("keeps the web path form explicit and submits a trimmed repository path", async () => {
        setupMocks(command => command === "query_workspace_context" ? context : []);
        await import("./PlaceMenu.svelte");
        vi.stubGlobal("EventSource", class { addEventListener() {} close() {} });
        delete (window as any).__TAURI_INTERNALS__;
        let paths: string[] = [];
        vi.spyOn(window, "fetch").mockImplementation(async (input, options) => {
            let command = String(input).split("/").at(-1);
            let value: unknown = command === "query_workspace_context" ? context : [];
            if (command === "query_workspace") {
                let path = JSON.parse(options?.body as string).path;
                paths.push(path);
                value = { ...workspace, absolute_path: path };
            }
            return new Response(JSON.stringify(value), { status: 200 });
        });
        let { findByRole, getByRole, queryByRole } = await mount();
        await fireEvent.click(await findByRole("button", { name: "Repository navigation: review@cortex" }));
        let field = getByRole("textbox", { name: "Repository path" });
        expect(document.activeElement).toBe(field);
        expect(queryByRole("button", { name: /Initialize repository/ })).toBeNull();
        expect((getByRole("button", { name: /^Open$/ }) as HTMLButtonElement).disabled).toBe(true);
        await fireEvent.input(field, { target: { value: "  /fixture/repository  " } });
        await fireEvent.submit(field.closest("form")!);
        await waitFor(() => expect(paths).toEqual(["/fixture/repository"]));
        expect(queryByRole("dialog")).toBeNull();
    });

});
