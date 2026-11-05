import { afterEach, describe, expect, it } from "vitest";
import { render, fireEvent } from "@testing-library/svelte";
import { setupMocks, cleanupMocks } from "../mocks";
import type { RepoConfig } from "../messages/RepoConfig";
import "../global.css";

let shell: HTMLDivElement;
afterEach(async () => { await cleanupMocks(); shell?.remove(); });
describe("workspace and project identity", () => {
    it.each(["default", "review"])("aligns %s@cortex and tints only alternate workspaces", async name => {
        setupMocks(command => command === "query_workspace_context" ? { project_name: "cortex", workspace_name: name, repo_path: "/work/cortex", workspace_path: "/work/cortex", workspaces: [] } : []);
        let { default: PlaceMenu } = await import("./PlaceMenu.svelte");
        shell = document.createElement("div"); shell.id = "shell"; shell.className = "dark"; document.body.append(shell);
        let workspace = { absolute_path: "/work/cortex" } as Extract<RepoConfig, { type: "Workspace" }>;
        let { findByRole, getByRole, container } = render(PlaceMenu, { target: shell, props: { workspace } });
        let workspaceButton = await findByRole("button", { name: `Workspace: ${name}` });
        let projectButton = getByRole("button", { name: "Project: cortex" });
        let first = workspaceButton.getBoundingClientRect(), second = projectButton.getBoundingClientRect();
        expect(first.left).toBeLessThan(second.left);
        expect(first.top + first.height / 2).toBe(second.top + second.height / 2);
        expect(container.querySelector(".place-rule")?.textContent).toBe("@");
        expect(workspaceButton.classList.contains("alternate-workspace")).toBe(name !== "default");
        await fireEvent.click(workspaceButton);
        expect(getByRole("menu", { name: "Workspace" })).toBeTruthy();
        await fireEvent.click(projectButton);
        expect(getByRole("menu", { name: "Project" })).toBeTruthy();
    });
});
