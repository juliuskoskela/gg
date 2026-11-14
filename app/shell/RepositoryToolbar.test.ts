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
    afterEach(async () => {
        let { bottomToolbar } = await import("./bottomToolbar");
        bottomToolbar.reset();
        await cleanupMocks();
    });

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

    it("places the upstream selector to the left of fetch and push by default without an overflow menu", async () => {
        let { default: Toolbar } = await import("./RepositoryToolbar.svelte");
        let { repoConfigEvent, repoStatusEvent } = await import("../stores");
        repoConfigEvent.set(workspace); repoStatusEvent.set(workspace.status);
        let { getByRole, queryByRole } = render(Toolbar, { props: { target: false, onRefresh: () => {} } });
        expect(queryByRole("button", { name: "More repository actions" })).toBeNull();
        let remote = getByRole("combobox", { name: "Git remote" });
        let fetch = getByRole("button", { name: "Fetch remote bookmarks" });
        let push = getByRole("button", { name: "Push all bookmarks" });
        expect(remote.compareDocumentPosition(fetch) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(fetch.compareDocumentPosition(push) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it("explains unavailable remote and redo actions and updates from configurable left/right tools", async () => {
        let { default: Toolbar } = await import("./RepositoryToolbar.svelte");
        let { bottomToolbar } = await import("./bottomToolbar");
        let { repositoryCommands } = await import("../commands/registry");
        let { repoConfigEvent, repoStatusEvent } = await import("../stores");
        repoConfigEvent.set({ ...workspace, git_remotes: [] }); repoStatusEvent.set(workspace.status);
        let opened = vi.fn(); window.addEventListener("gg:open-commands", opened);
        let { getByRole, queryByRole } = render(Toolbar, { props: { target: false, onRefresh: () => {} } });
        expect(queryByRole("button", { name: "More repository actions" })).toBeNull();
        expect(repositoryCommands().find(c => c.id === "repository.push")?.reason).toBe("No Git remote configured");
        expect(repositoryCommands().find(c => c.id === "repository.redo")?.reason).toBe("Nothing to redo");
        let redo = getByRole("button", { name: "Redo the latest undone operation" }) as HTMLButtonElement;
        expect(redo.disabled).toBe(true);
        expect(redo.title).toContain("Nothing to redo");
        repoStatusEvent.set({ ...workspace.status, can_redo: true });
        await waitFor(() => expect(redo.disabled).toBe(false));
        let fetch = getByRole("button", { name: "Fetch remote bookmarks" }) as HTMLButtonElement;
        expect(fetch.disabled).toBe(true);
        expect(fetch.title).toBe("No Git remote configured");
        expect(getByRole("button", { name: "Undo the latest operation" })).toBeTruthy();

        bottomToolbar.add("right", "commands");
        bottomToolbar.add("left", "refresh");
        let commandsButton = await waitFor(() => getByRole("button", { name: "Open commands (Ctrl/⌘ K)" }));
        expect(getByRole("button", { name: "Refresh repository" })).toBeTruthy();
        await fireEvent.click(commandsButton);
        await waitFor(() => expect(opened).toHaveBeenCalledOnce());
        window.removeEventListener("gg:open-commands", opened);
    });

    it("fetches from the chosen remote, and asks which remote once the selector is removed", async () => {
        let { default: Toolbar } = await import("./RepositoryToolbar.svelte");
        let { bottomToolbar } = await import("./bottomToolbar");
        let { currentInput, repoConfigEvent, repoStatusEvent } = await import("../stores");
        let { get } = await import("svelte/store");
        repoConfigEvent.set(workspace); repoStatusEvent.set(workspace.status);
        let { getByRole } = render(Toolbar, { props: { target: false, onRefresh: () => {} } });

        let remote = getByRole("combobox", { name: "Git remote" }) as HTMLSelectElement;
        await fireEvent.change(remote, { target: { value: "upstream" } });
        await fireEvent.click(getByRole("button", { name: "Fetch remote bookmarks" }));
        await waitFor(() => expect(calls).toHaveLength(1));
        expect(calls[0]).toMatchObject({ cmd: "git_fetch", args: { mutation: { refspec: { remote_name: "upstream" } } } });

        bottomToolbar.remove("remote");
        await waitFor(() => expect(document.querySelector('[aria-label="Git remote"]')).toBeNull());
        await fireEvent.click(getByRole("button", { name: "Push all bookmarks" }));
        let prompt = await waitFor(() => { let value = get(currentInput); expect(value?.title).toBe("Push bookmarks"); return value!; });
        expect(prompt.fields[0].choices).toEqual(["origin", "upstream"]);
        prompt.callback({ fields: { Remote: "origin" } });
        await waitFor(() => expect(calls).toHaveLength(2));
        expect(calls[1]).toMatchObject({ cmd: "git_push", args: { mutation: { refspec: { remote_name: "origin" } } } });
    });
});
