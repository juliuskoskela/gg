import "../global.css";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, waitFor } from "@testing-library/svelte";
import { cleanupMocks, setupMocks } from "../mocks";
import type { RepoConfig } from "../messages/RepoConfig";
import type { RevChange } from "../messages/RevChange";
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
    has_external_diff_tool: true,
    has_external_merge_tool: true,
};

let header: RevHeader = {
    id: {
        change: { type: "ChangeId", hex: "ztxrwlzl", prefix: "ztx", rest: "rwlzl", offset: null, is_divergent: false },
        commit: { type: "CommitId", hex: "59611222", prefix: "596", rest: "11222" },
    },
    description: { lines: ["Update diff tools"] },
    author: { name: "Test", email: "test@example.com", timestamp: "2026-01-01T00:00:00Z" },
    has_conflict: false,
    is_working_copy: true,
    working_copy_of: null,
    is_immutable: false,
    refs: [],
    parent_ids: [{ type: "CommitId", hex: "00000000", prefix: "000", rest: "00000" }],
};

let changes: RevChange[] = [
    {
        kind: "Modified",
        path: { repo_path: "src/lib.rs", relative_path: "src/lib.rs" },
        has_conflict: false,
        hunks: [],
    },
    {
        kind: "Added",
        path: { repo_path: "src/conflicts.rs", relative_path: "src/conflicts.rs" },
        has_conflict: true,
        hunks: [],
    },
];

describe("diff view Changes dropdown", () => {
    beforeEach(() => {
        setupMocks(() => undefined);
    });

    afterEach(async () => {
        let { changeSelectEvent, ignoreToggled } = await import("../stores");
        let { setCommandOperand } = await import("../commands/context");
        changeSelectEvent.set(undefined);
        ignoreToggled.set(false);
        setCommandOperand(null);
        await cleanupMocks();
    });

    it("hides Changes dropdown when revision has no changed files and binds to the active file in DiffTools", async () => {
        let { default: DiffTools } = await import("./DiffTools.svelte");
        let { repoConfigEvent, repoStatusEvent } = await import("../stores");
        repoConfigEvent.set(workspace);
        repoStatusEvent.set(workspace.status);

        let { queryByRole, getByRole, rerender } = render(DiffTools, {
            props: { changes: [], headers: [header] },
        });
        expect(queryByRole("button", { name: "Changes" })).toBeNull();

        await rerender({ changes, headers: [header], selectedPath: "src/conflicts.rs" });
        let trigger = getByRole("button", { name: "Changes" });
        expect(trigger.getAttribute("aria-haspopup")).toBe("menu");
        expect(trigger.getAttribute("title")).toBe("Actions for src/conflicts.rs");

        await fireEvent.click(trigger);
        let menu = await waitFor(() => getByRole("menu", { name: "Changes" }));
        expect(menu.textContent).toContain("src/conflicts.rs");
        expect((getByRole("menuitem", { name: "View file history" }) as HTMLButtonElement).disabled).toBe(false);
        expect((getByRole("menuitem", { name: "Open in external diff tool" }) as HTMLButtonElement).disabled).toBe(false);
        expect((getByRole("menuitem", { name: "Resolve in external merge tool" }) as HTMLButtonElement).disabled).toBe(false);
        expect((getByRole("menuitem", { name: "Squash file into parent" }) as HTMLButtonElement).disabled).toBe(false);
        expect((getByRole("menuitem", { name: "Restore file from parent" }) as HTMLButtonElement).disabled).toBe(false);
        expect((getByRole("menuitem", { name: "Copy path" }) as HTMLButtonElement).disabled).toBe(false);
    });

    it("reflects selected hunk scope when a hunk of the active file is chosen", async () => {
        let { default: DiffTools } = await import("./DiffTools.svelte");
        let { repoConfigEvent, repoStatusEvent } = await import("../stores");
        let { setCommandOperand } = await import("../commands/context");
        repoConfigEvent.set(workspace);
        repoStatusEvent.set(workspace.status);
        setCommandOperand({
            type: "Change",
            headers: [header],
            path: changes[0].path,
            hunk: {
                location: { from_file: { start: 1, len: 2 }, to_file: { start: 1, len: 3 } },
                lines: { lines: ["+new"] },
            },
        });

        let { getByRole } = render(DiffTools, {
            props: { changes, headers: [header], selectedPath: "src/lib.rs" },
        });
        await fireEvent.click(getByRole("button", { name: "Changes" }));
        let menu = await waitFor(() => getByRole("menu", { name: "Changes" }));
        expect(menu.textContent).toContain("src/lib.rs (hunk)");
        expect(getByRole("menuitem", { name: "Squash hunk into parent" })).toBeTruthy();
        expect(getByRole("menuitem", { name: "Restore hunk from parent" })).toBeTruthy();
    });
});
