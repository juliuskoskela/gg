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

    it("opens commands on mobile and explains unavailable remote and redo actions", async () => {
        let { default: Toolbar } = await import("./RepositoryToolbar.svelte");
        let { repositoryCommands } = await import("../commands/registry");
        let { repoConfigEvent, repoStatusEvent } = await import("../stores");
        repoConfigEvent.set({ ...workspace, git_remotes: [] }); repoStatusEvent.set(workspace.status);
        let opened = vi.fn(); window.addEventListener("gg:open-commands", opened);
        let { getByRole, queryByRole } = render(Toolbar, { props: { target: false, onRefresh: () => {} } });
        expect(queryByRole("button", { name: "Commands" })).toBeNull();
        await fireEvent.click(getByRole("button", { name: "More repository actions" }));
        await fireEvent.click(getByRole("menuitem", { name: "Commands…" }));
        await waitFor(() => expect(opened).toHaveBeenCalledOnce());
        expect(repositoryCommands().find(c => c.id === "repository.push")?.reason).toBe("No Git remote configured");
        expect(repositoryCommands().find(c => c.id === "repository.redo")?.reason).toBe("Nothing to redo");
        let redo = getByRole("button", { name: "Redo the latest undone operation" }) as HTMLButtonElement;
        expect(redo.disabled).toBe(true);
        expect(redo.title).toContain("Nothing to redo");
        repoStatusEvent.set({ ...workspace.status, can_redo: true });
        await waitFor(() => expect(redo.disabled).toBe(false));
        expect((getByRole("button", { name: "Fetch remote bookmarks" }) as HTMLButtonElement).disabled).toBe(true);
        expect(getByRole("button", { name: "Undo the latest operation" })).toBeTruthy();
        window.removeEventListener("gg:open-commands", opened);
    });
});
