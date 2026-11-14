import { get } from "svelte/store";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanupMocks, setupMocks } from "../mocks";
import type { RepoConfig } from "../messages/RepoConfig";
import type { RevChange } from "../messages/RevChange";
import type { RevHeader } from "../messages/RevHeader";
import { operationState } from "../operations";
import { currentMutation, ignoreToggled, repoConfigEvent, repoStatusEvent } from "../stores";
import { currentWorkspaceIdentity } from "./context";
import { repositoryLocationCommands } from "./registry";
import { buildFileActionsMenu, buildTopMenus, type DropdownMenu, type MenuEntry, type TopMenuInputs } from "./menus";

let workspace: Extract<RepoConfig, { type: "Workspace" }> = {
    type: "Workspace",
    absolute_path: "/work/gg",
    git_remotes: ["origin"],
    query_choices: {},
    latest_query: "@",
    theme_override: null,
    status: { operation_description: "describe change", working_copy: { type: "CommitId", hex: "abc12345", prefix: "abc", rest: "12345" }, can_redo: false },
    mark_unpushed_bookmarks: true,
    track_recent_workspaces: false,
    ignore_immutable: false,
    has_external_diff_tool: false,
    has_external_merge_tool: false,
};

let header: RevHeader = {
    id: {
        change: { type: "ChangeId", hex: "ztxrwlzlabcd", prefix: "ztx", rest: "rwlzlabcd", offset: null, is_divergent: false },
        commit: { type: "CommitId", hex: "59611222", prefix: "596", rest: "11222" },
    },
    description: { lines: ["Tidy top menu", "body"] },
    author: { name: "Test", email: "test@example.com", timestamp: "2026-01-01T00:00:00Z" },
    has_conflict: false,
    is_working_copy: true,
    working_copy_of: null,
    is_immutable: false,
    refs: [{ type: "LocalBookmark", bookmark_name: "main", has_conflict: false, is_synced: true, tracking_remotes: ["origin"], available_remotes: 1, potential_remotes: 1 }],
    parent_ids: [{ type: "CommitId", hex: "00000000", prefix: "000", rest: "00000" }],
};

let change: RevChange = { kind: "Modified", path: { repo_path: "src/lib.rs", relative_path: "src/lib.rs" }, has_conflict: false, hunks: [] };

function inputs(overrides: Partial<TopMenuInputs> = {}): TopMenuInputs {
    return { headers: [], operand: null, ignoreImmutable: false, refreshing: false, extensions: [], onSettings: () => {}, onHistory: () => {}, onWorkingCopy: () => {}, onPanel: () => {}, ...overrides };
}

function items(menu: DropdownMenu): MenuEntry[] {
    return menu.sections.flatMap(section => section.items);
}

function entry(menu: DropdownMenu, id: string): MenuEntry {
    let found = items(menu).find(item => item.id === id);
    if (!found) throw new Error(`no ${id} in ${menu.label}: ${items(menu).map(item => item.id).join(", ")}`);
    return found;
}

describe("menu builders", () => {
    beforeEach(() => {
        setupMocks(() => undefined);
        repoConfigEvent.set(workspace);
        repoStatusEvent.set(workspace.status);
        currentWorkspaceIdentity.set({ type: "known", name: "default" });
        currentMutation.set(null);
        operationState.set(null);
        ignoreToggled.set(false);
    });
    afterEach(async () => {
        currentMutation.set(null);
        operationState.set(null);
        await cleanupMocks();
    });

    it("orders the menus Repository, Revision, Bookmarks, Tools and leaves no section empty", () => {
        let menus = buildTopMenus(inputs({ headers: [header] }));
        expect(menus.map(menu => menu.label)).toEqual(["Repository", "Revision", "Bookmarks", "Tools"]);
        for (let menu of menus) {
            expect(menu.sections.every(section => section.items.length > 0), menu.label).toBe(true);
            let ids = items(menu).map(item => item.id);
            expect(new Set(ids).size, menu.label).toBe(ids.length);
        }
    });

    it("explains every unavailable entry", () => {
        repoConfigEvent.set({ ...workspace, git_remotes: [] });
        for (let menu of buildTopMenus(inputs())) {
            for (let item of items(menu)) {
                if (item.reason !== null && item.reason !== undefined) expect(item.reason.trim(), `${menu.label}: ${item.label}`).not.toBe("");
            }
        }
        let [repository, revision, bookmarks] = buildTopMenus(inputs());
        expect(entry(repository, "repository.fetch").reason).toBe("No Git remote configured");
        expect(entry(repository, "repository.redo").reason).toBe("Nothing to redo");
        // the browser initializes through the web server; cloning still needs the desktop folder dialog
        let browser = repositoryLocationCommands(false);
        expect(browser.find(command => command.id === "repository.init")?.reason).toBeNull();
        expect(browser.find(command => command.id === "repository.clone")?.reason).toBe("Available in the desktop app");
        expect(revision.context).toBe("No revision selected");
        expect(entry(revision, "new_child").reason).toBe("Select a revision");
        expect(entry(revision, "view.evolution").reason).toBe("Select a revision");
        expect(entry(revision, "annotate").reason).toBe("Select a revision");
        expect(bookmarks.context).toBe("No bookmark selected");
        expect(entry(bookmarks, "context-push-all").reason).toBe("Select a bookmark or tag");
        expect(entry(bookmarks, "context-delete").destructive).toBe(true);
    });

    it("disables repository actions while another operation runs", () => {
        operationState.set({ id: 1, label: "Testing", phase: "pending" });
        let [repository] = buildTopMenus(inputs());
        for (let id of ["repository.undo", "repository.refresh", "repository.fetch", "repository.new_workspace", "repository.rename_workspace", "repository.immutable"]) {
            expect(entry(repository, id).reason, id).toBe("Another operation is in progress");
        }
        expect(entry(buildTopMenus(inputs({ refreshing: true }))[0], "repository.refresh").reason).toBe("Refreshing repository");
    });

    it("shows immutability override as a checkbox with a fixed label", () => {
        let off = entry(buildTopMenus(inputs())[0], "repository.immutable");
        expect(off).toMatchObject({ label: "Override immutability protection", checked: false });
        let on = entry(buildTopMenus(inputs({ ignoreImmutable: true }))[0], "repository.immutable");
        expect(on).toMatchObject({ label: "Override immutability protection", checked: true });
        on.execute();
        expect(get(ignoreToggled)).toBe(true);
    });

    it("marks entries that open dialogs so the trigger can take focus back first", () => {
        let [repository, , , tools] = buildTopMenus(inputs());
        expect(entry(repository, "repository.new_workspace").opensModal).toBe(true);
        expect(entry(repository, "repository.rename_workspace").opensModal).toBe(true);
        expect(entry(repository, "repository.open").opensModal).toBe(true);
        expect(entry(tools, "tools.commands").opensModal).toBe(true);
        expect(entry(repository, "repository.undo").opensModal).toBeUndefined();
    });

    it("summarises the selected revision and resolves its only bookmark", () => {
        let [, revision, bookmarks] = buildTopMenus(inputs({ headers: [header] }));
        expect(revision.context).toBe("ztxrwlzl · Tidy top menu");
        expect(entry(revision, "new_child").reason).toBeNull();
        expect(bookmarks.context).toBe("main");
        expect(entry(bookmarks, "context-push-all").label).toBeTruthy();

        let [, many] = buildTopMenus(inputs({ headers: [header, { ...header, id: { ...header.id, commit: { ...header.id.commit, hex: "77777777" } } }] }));
        expect(many.context).toBe("2 revisions selected");

        let ambiguous = { ...header, refs: [...header.refs, { ...header.refs[0], bookmark_name: "release" }] };
        let [, , unresolved] = buildTopMenus(inputs({ headers: [ambiguous] }));
        expect(unresolved.context).toBe("No bookmark selected");
        expect(entry(unresolved, "context-push-all").reason).toBe("Click a bookmark or tag chip first");
    });

    it("routes view entries through the panel and history callbacks", () => {
        let onPanel = vi.fn(), onHistory = vi.fn(), onSettings = vi.fn(), onWorkingCopy = vi.fn();
        let [repository, revision, , tools] = buildTopMenus(inputs({ headers: [header], onPanel, onHistory, onSettings, onWorkingCopy }));
        entry(repository, "view.history").execute();
        entry(revision, "view.evolution").execute();
        entry(tools, "tools.terminal").execute();
        entry(tools, "tools.annotations").execute();
        entry(tools, "tools.settings").execute();
        entry(tools, "tools.working_copy").execute();
        expect(onHistory).toHaveBeenCalledOnce();
        expect(onPanel.mock.calls).toEqual([["evolution"], ["terminal"], ["annotations"]]);
        expect(onSettings).toHaveBeenCalledOnce();
        expect(onWorkingCopy).toHaveBeenCalledOnce();
        // Settings closes the menu, after everything else
        expect(items(tools).at(-1)?.id).toBe("tools.settings");
    });

    it("builds file actions for the owning revision, and explains them without one", () => {
        let menu = buildFileActionsMenu({ change, headers: [header], operand: null });
        expect(menu.context).toBe("src/lib.rs");
        expect(entry(menu, "context-squash").reason).toBeNull();
        expect(entry(menu, "context-move_to").opensModal).toBe(true);
        expect(entry(menu, "file.copy-path").reason).toBeNull();

        let orphan = buildFileActionsMenu({ change, headers: [], operand: null });
        for (let id of ["context-file_history", "context-squash", "context-restore", "context-move_to", "context-copy_to", "annotate"]) {
            expect(entry(orphan, id).reason, id).toBe("Select a revision");
        }
        expect(entry(orphan, "file.copy-path").reason).toBeNull();
    });
});
