import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, waitFor } from "@testing-library/svelte";
import { setupMocks, cleanupMocks } from "../mocks";
import type { RepoConfig } from "../messages/RepoConfig";

let workspace: Extract<RepoConfig, { type: "Workspace" }> = {
    type: "Workspace", absolute_path: "/work/gg", git_remotes: ["origin", "upstream"], query_choices: {}, latest_query: "@", theme_override: null,
    status: { operation_description: "describe", working_copy: { type: "CommitId", hex: "abc", prefix: "a", rest: "bc" }, can_redo: false },
    mark_unpushed_bookmarks: true, track_recent_workspaces: false, ignore_immutable: false, has_external_diff_tool: false, has_external_merge_tool: false,
};

describe("repository toolbar and commands", () => {
    let calls: { cmd: string; args: Record<string, unknown> }[];
    beforeEach(() => {
        calls = [];
        setupMocks((cmd, args) => {
            if (cmd === "query_recent_workspaces") return ["/work/other"];
            if (cmd === "query_workspace") { calls.push({ cmd, args }); return { ...workspace, absolute_path: "/work/other" }; }
            if (cmd === "forward_accelerator") { calls.push({ cmd, args }); return; }
            if (cmd === "query_operation_preflight") return { eligible: true, description: "describe", reason: null };
            if (["git_fetch", "git_push", "undo_operation"].includes(cmd)) { calls.push({ cmd, args }); return { type: "Unchanged" }; }
        });
    });
    afterEach(async () => cleanupMocks());

    it("routes shared fetch, push and undo commands to the selected remote", async () => {
        let { repositoryCommands } = await import("../commands/registry");
        let { repoConfigEvent, repoStatusEvent } = await import("../stores");
        repoConfigEvent.set(workspace); repoStatusEvent.set(workspace.status);
        for (let id of ["repository.fetch", "repository.push", "repository.undo"]) {
            await repositoryCommands("upstream").find(command => command.id === id)?.execute();
        }
        expect(calls.map(call => call.cmd)).toEqual(["git_fetch", "git_push", "undo_operation"]);
        expect(calls[0]).toMatchObject({ args: { mutation: { refspec: { type: "AllBookmarks", remote_name: "upstream" } } } });
        expect(calls[1]).toMatchObject({ args: { mutation: { refspec: { remote_name: "upstream" } } } });
    });

    it("switches appearance from the menu and keeps the menu open", async () => {
        let { default: Toolbar } = await import("./RepositoryToolbar.svelte");
        let { repoConfigEvent } = await import("../stores");
        let { themePreference } = await import("../display/theme");
        repoConfigEvent.set({ ...workspace, theme_override: "light" });
        themePreference.sync(null);
        let { container, getByRole } = render(Toolbar, { props: { target: false, onRefresh: () => {} } });
        container.querySelector<HTMLElement>(".history-actions")!.style.display = "flex";
        await fireEvent.click(getByRole("button", { name: "More repository actions" }));
        await fireEvent.click(getByRole("button", { name: "Theme: light. Switch to dark theme" }));
        expect(getByRole("button", { name: "Theme: dark. Switch to light theme" })).toBeTruthy();
        expect(localStorage.getItem("gg.ui.theme")).toBe("dark");
        localStorage.removeItem("gg.ui.theme");
        themePreference.sync(null);
    });

    it("exposes native repository actions and opens recent workspaces", async () => {
        let { default: Toolbar } = await import("./RepositoryToolbar.svelte");
        let { repoConfigEvent, repoStatusEvent } = await import("../stores");
        repoConfigEvent.set(workspace); repoStatusEvent.set(workspace.status);
        let { container, getByRole, findByRole } = render(Toolbar, { props: { target: false, onRefresh: () => {} } });
        container.querySelector<HTMLElement>(".history-actions")!.style.display = "flex";
        await fireEvent.click(getByRole("button", { name: "More repository actions" }));
        await fireEvent.click(getByRole("button", { name: "Initialize repository…" }));
        await waitFor(() => expect(calls).toContainEqual({ cmd: "forward_accelerator", args: { key: "n", ctrl: true, shift: true } }));
        await fireEvent.click(getByRole("button", { name: "More repository actions" }));
        await fireEvent.click(await findByRole("button", { name: "/work/other" }));
        await waitFor(() => expect(calls).toContainEqual({ cmd: "query_workspace", args: { path: "/work/other" } }));
    });

    it("opens commands on mobile and explains unavailable remote and redo actions", async () => {
        let { default: Toolbar } = await import("./RepositoryToolbar.svelte");
        let { repositoryCommands } = await import("../commands/registry");
        let { repoConfigEvent, repoStatusEvent } = await import("../stores");
        repoConfigEvent.set({ ...workspace, git_remotes: [] }); repoStatusEvent.set(workspace.status);
        let opened = vi.fn(); window.addEventListener("gg:open-commands", opened);
        let { getByRole } = render(Toolbar, { props: { target: false, onRefresh: () => {} } });
        await fireEvent.click(getByRole("button", { name: "Commands" }));
        expect(opened).toHaveBeenCalledOnce();
        expect(repositoryCommands().find(c => c.id === "repository.push")?.reason).toBe("No Git remote configured");
        expect(repositoryCommands().find(c => c.id === "repository.redo")?.reason).toBe("Nothing to redo");
        window.removeEventListener("gg:open-commands", opened);
    });
});
