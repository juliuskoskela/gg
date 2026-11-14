import "../global.css";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, waitFor } from "@testing-library/svelte";
import { get } from "svelte/store";
import { cleanupMocks, setupMocks } from "../mocks";
import type { RepoConfig } from "../messages/RepoConfig";
import type { RevHeader } from "../messages/RevHeader";

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

let revision: RevHeader = {
    id: {
        change: { type: "ChangeId", hex: "ztxrwlzl", prefix: "ztx", rest: "rwlzl", offset: null, is_divergent: false },
        commit: { type: "CommitId", hex: "59611222", prefix: "596", rest: "11222" },
    },
    description: { lines: ["Tidy top menu"] },
    author: { name: "Test", email: "test@example.com", timestamp: "2026-01-01T00:00:00Z" },
    has_conflict: false,
    is_working_copy: true,
    working_copy_of: null,
    is_immutable: false,
    refs: [{ type: "LocalBookmark", bookmark_name: "main", has_conflict: false, is_synced: true, tracking_remotes: ["origin"], available_remotes: 1, potential_remotes: 1 }],
    parent_ids: [{ type: "CommitId", hex: "00000000", prefix: "000", rest: "00000" }],
};

describe("top application menubar", () => {
    let calls: string[];
    beforeEach(() => {
        calls = [];
        setupMocks(command => {
            calls.push(command);
            if (command === "query_snapshot") return workspace.status;
            return undefined;
        });
    });

    afterEach(async () => {
        let { ignoreToggled, selectionHeaders, changeSelectEvent } = await import("../stores");
        let { setCommandOperand } = await import("../commands/context");
        ignoreToggled.set(false);
        selectionHeaders.set([]);
        changeSelectEvent.set(undefined);
        setCommandOperand(null);
        await cleanupMocks();
    });

    it("categorizes repository, revision, bookmarks and tools from left to right", async () => {
        let { default: TopMenuBar } = await import("./TopMenuBar.svelte");
        let { repoConfigEvent, repoStatusEvent, ignoreToggled } = await import("../stores");
        repoConfigEvent.set(workspace);
        repoStatusEvent.set(workspace.status);

        let { getByRole } = render(TopMenuBar, { props: { onSettings: () => {}, onHistory: () => {}, onWorkingCopy: () => {}, onPanel: () => {} } });
        let menubar = getByRole("menubar", { name: "Application menu" });
        let triggers = [...menubar.querySelectorAll<HTMLButtonElement>(':scope > [role="menuitem"]')];
        expect(triggers.map(button => button.textContent?.trim())).toEqual(["Repository", "Revision", "Bookmarks", "Tools"]);

        await fireEvent.click(triggers[0]);
        expect(getByRole("menu", { name: "Repository" })).toBeTruthy();
        expect(getByRole("menuitem", { name: "Open repository…" })).toBeTruthy();
        expect(getByRole("menuitem", { name: "New workspace…" })).toBeTruthy();
        expect(getByRole("menuitem", { name: "Refresh repository" })).toBeTruthy();
        expect((getByRole("menuitem", { name: "Redo" }) as HTMLButtonElement).disabled).toBe(true);

        let override = getByRole("menuitemcheckbox", { name: "Override immutability protection" });
        expect(override.getAttribute("aria-checked")).toBe("false");
        await fireEvent.click(override);
        expect(get(ignoreToggled)).toBe(true);
    });

    it("switches open menus with ArrowRight/ArrowLeft and hover, and restores focus before opening Commands", async () => {
        let { default: TopMenuBar } = await import("./TopMenuBar.svelte");
        let { repoConfigEvent, repoStatusEvent, selectionHeaders } = await import("../stores");
        repoConfigEvent.set(workspace);
        repoStatusEvent.set(workspace.status);
        selectionHeaders.set([revision]);

        let activeDuringCommands: Element | null = null;
        let onCommands = () => { activeDuringCommands = document.activeElement; };
        window.addEventListener("gg:open-commands", onCommands);

        let { getByRole, queryByRole } = render(TopMenuBar, { props: { onSettings: () => {}, onHistory: () => {}, onWorkingCopy: () => {}, onPanel: () => {} } });
        let menubar = getByRole("menubar", { name: "Application menu" });
        let repoTrigger = menubar.querySelectorAll<HTMLButtonElement>(':scope > [role="menuitem"]')[0];
        let bookmarksTrigger = menubar.querySelectorAll<HTMLButtonElement>(':scope > [role="menuitem"]')[2];
        let toolsTrigger = menubar.querySelectorAll<HTMLButtonElement>(':scope > [role="menuitem"]')[3];

        await fireEvent.click(repoTrigger);
        await waitFor(() => expect(getByRole("menu", { name: "Repository" })).toBeTruthy());

        await fireEvent.keyDown(getByRole("menu", { name: "Repository" }), { key: "ArrowRight" });
        let revisionMenu = await waitFor(() => getByRole("menu", { name: "Revision" }));
        expect(revisionMenu.textContent).toContain("Tidy top menu");
        expect(getByRole("menuitem", { name: "New child" })).toBeTruthy();

        await fireEvent.pointerEnter(bookmarksTrigger, { pointerType: "touch" });
        expect(getByRole("menu", { name: "Revision" })).toBeTruthy();
        await fireEvent.pointerEnter(bookmarksTrigger, { pointerType: "mouse" });
        let bookmarksMenu = await waitFor(() => getByRole("menu", { name: "Bookmarks" }));
        expect(bookmarksMenu.textContent).toContain("main");
        expect(getByRole("menuitem", { name: "Push bookmark" })).toBeTruthy();

        await fireEvent.keyDown(bookmarksMenu, { key: "ArrowRight" });
        await waitFor(() => expect(getByRole("menu", { name: "Tools" })).toBeTruthy());
        await fireEvent.click(getByRole("menuitem", { name: "Commands…" }));
        expect(queryByRole("menu")).toBeNull();
        expect(activeDuringCommands).toBe(toolsTrigger);

        window.removeEventListener("gg:open-commands", onCommands);
    });

    it("follows the menubar keyboard pattern: roving focus, Enter to the first item, Escape back to the trigger", async () => {
        let { default: TopMenuBar } = await import("./TopMenuBar.svelte");
        let { repoConfigEvent, repoStatusEvent } = await import("../stores");
        repoConfigEvent.set(workspace);
        repoStatusEvent.set(workspace.status);

        let { getByRole, queryByRole } = render(TopMenuBar, { props: { onSettings: () => {}, onHistory: () => {}, onWorkingCopy: () => {}, onPanel: () => {} } });
        let triggers = [...getByRole("menubar", { name: "Application menu" }).querySelectorAll<HTMLButtonElement>(':scope > [role="menuitem"]')];
        expect(triggers.map(trigger => trigger.tabIndex)).toEqual([0, -1, -1, -1]);

        triggers[0].focus();
        await fireEvent.keyDown(triggers[0], { key: "ArrowRight" });
        expect(document.activeElement).toBe(triggers[1]);
        expect(queryByRole("menu")).toBeNull();
        await fireEvent.keyDown(triggers[1], { key: "End" });
        expect(document.activeElement).toBe(triggers[3]);
        await fireEvent.keyDown(triggers[3], { key: "ArrowRight" });
        expect(document.activeElement).toBe(triggers[0]);
        await waitFor(() => expect(triggers.map(trigger => trigger.tabIndex)).toEqual([0, -1, -1, -1]));

        // keyboard activation clicks with detail 0
        triggers[0].dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 0 }));
        let menu = await waitFor(() => getByRole("menu", { name: "Repository" }));
        await waitFor(() => expect(document.activeElement).toBe(getByRole("menuitem", { name: "Open repository…" })));
        expect(triggers[0].getAttribute("aria-expanded")).toBe("true");
        expect(triggers[0].getAttribute("aria-controls")).toBe(menu.id);

        await fireEvent.keyDown(document.activeElement!, { key: "Escape" });
        await waitFor(() => expect(queryByRole("menu")).toBeNull());
        expect(document.activeElement).toBe(triggers[0]);

        await fireEvent.keyDown(triggers[0], { key: "ArrowUp" });
        await waitFor(() => expect(getByRole("menu", { name: "Repository" })).toBeTruthy());
        let enabled = [...getByRole("menu").querySelectorAll<HTMLButtonElement>('[role^="menuitem"]:not(:disabled)')];
        expect(document.activeElement).toBe(enabled.at(-1));
    });

    it("reverses horizontal arrows in right-to-left layouts", async () => {
        let { default: TopMenuBar } = await import("./TopMenuBar.svelte");
        let { repoConfigEvent, repoStatusEvent } = await import("../stores");
        repoConfigEvent.set(workspace);
        repoStatusEvent.set(workspace.status);
        document.documentElement.dir = "rtl";
        try {
            let { getByRole } = render(TopMenuBar, { props: { onSettings: () => {}, onHistory: () => {}, onWorkingCopy: () => {}, onPanel: () => {} } });
            let triggers = [...getByRole("menubar", { name: "Application menu" }).querySelectorAll<HTMLButtonElement>(':scope > [role="menuitem"]')];
            triggers[1].focus();
            await fireEvent.keyDown(triggers[1], { key: "ArrowLeft" });
            expect(document.activeElement).toBe(triggers[2]);
            await fireEvent.keyDown(triggers[2], { key: "ArrowDown" });
            let bookmarks = await waitFor(() => getByRole("menu", { name: "Bookmarks" }));
            await fireEvent.keyDown(bookmarks, { key: "ArrowRight" });
            await waitFor(() => expect(getByRole("menu", { name: "Revision" })).toBeTruthy());
        } finally {
            document.documentElement.dir = "";
        }
    });

    it("describes disabled entries with their reason without changing their names", async () => {
        let { default: TopMenuBar } = await import("./TopMenuBar.svelte");
        let { repoConfigEvent, repoStatusEvent } = await import("../stores");
        repoConfigEvent.set({ ...workspace, git_remotes: [] });
        repoStatusEvent.set(workspace.status);

        let { getByRole } = render(TopMenuBar, { props: { onSettings: () => {}, onHistory: () => {}, onWorkingCopy: () => {}, onPanel: () => {} } });
        await fireEvent.click(getByRole("menubar", { name: "Application menu" }).querySelector<HTMLButtonElement>('[role="menuitem"]')!);
        let fetch = getByRole("menuitem", { name: "Fetch remote bookmarks…" }) as HTMLButtonElement;
        expect(fetch.disabled).toBe(true);
        expect(document.getElementById(fetch.getAttribute("aria-describedby")!)?.textContent).toBe("No Git remote configured");
        let refresh = getByRole("menuitem", { name: "Refresh repository" });
        expect(refresh.hasAttribute("aria-describedby")).toBe(false);
    });

    it("prompts to create a new workspace from the Repository menu", async () => {
        let mutations: { command: string; args: unknown }[] = [];
        setupMocks((command, args) => {
            if (command === "add_workspace" || command === "open_workspace") {
                mutations.push({ command, args });
                return command === "add_workspace"
                    ? { type: "Updated", new_status: workspace.status, new_selection: null }
                    : { type: "Unchanged" };
            }
            return undefined;
        });
        let { default: TopMenuBar } = await import("./TopMenuBar.svelte");
        let { currentInput, repoConfigEvent, repoStatusEvent } = await import("../stores");
        repoConfigEvent.set(workspace);
        repoStatusEvent.set(workspace.status);

        let { getByRole } = render(TopMenuBar, { props: { onSettings: () => {}, onHistory: () => {}, onWorkingCopy: () => {}, onPanel: () => {} } });
        let repoTrigger = getByRole("menubar", { name: "Application menu" }).querySelectorAll<HTMLButtonElement>(':scope > [role="menuitem"]')[0];
        await fireEvent.click(repoTrigger);
        await fireEvent.click(getByRole("menuitem", { name: "New workspace…" }));

        let prompt = await waitFor(() => {
            let value = get(currentInput);
            expect(value?.title).toBe("New Workspace");
            return value!;
        });
        expect(prompt.detail).toContain("/work/gg-<name>");
        prompt.callback({
            fields: {
                "Workspace Name": "feature",
                "Destination": "",
                "Open Workspace": "true",
            },
        });

        await waitFor(() => expect(mutations).toEqual([
            { command: "add_workspace", args: { mutation: { name: "feature", path: "" }, options: { ignore_immutable: false } } },
            { command: "open_workspace", args: { mutation: { name: "feature" }, options: { ignore_immutable: false } } },
        ]));
    });
});
