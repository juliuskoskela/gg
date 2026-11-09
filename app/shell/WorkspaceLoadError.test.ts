import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/svelte";
import WorkspaceLoadError from "./WorkspaceLoadError.svelte";

let callbacks = () => ({ onOpen: vi.fn(), onChoose: vi.fn(), onInitialize: vi.fn(), onClone: vi.fn(), onReopen: vi.fn() });
afterEach(cleanup);
it("explains the selected Git checkout and offers an explicit setup action", async () => {
    let actions = callbacks();
    let ui = render(WorkspaceLoadError, { props: { config: { type: "LoadError", absolute_path: "/repo/subdir", git_root: "/repo", message: "No Jujutsu repository" }, desktop: true, recentWorkspaces: [], ...actions } });
    expect(ui.getByRole("dialog", { name: "Jujutsu setup needed" })).toBeInTheDocument();
    expect(ui.getByLabelText("Repository path")).toHaveValue("/repo/subdir");
    expect(actions.onInitialize).not.toHaveBeenCalled();
    await fireEvent.click(ui.getByRole("button", { name: "Set up Jujutsu…" }));
    expect(actions.onInitialize).toHaveBeenCalledWith("/repo");
});
it("offers browser users a local setup command without pretending to initialize", () => {
    let actions = callbacks();
    let ui = render(WorkspaceLoadError, { props: { config: { type: "LoadError", absolute_path: "/repo", git_root: "/repo", message: "No Jujutsu repository" }, desktop: false, recentWorkspaces: [], ...actions } });
    expect(ui.getByText("jj git init --colocate")).toBeInTheDocument();
    expect(ui.queryByRole("button", { name: "Set up Jujutsu…" })).not.toBeInTheDocument();
    expect(actions.onInitialize).not.toHaveBeenCalled();
});
it("keeps ordinary load errors actionable without suggesting Git initialization", async () => {
    let actions = callbacks();
    let ui = render(WorkspaceLoadError, { props: { config: { type: "LoadError", absolute_path: "/missing", message: "Not found" }, desktop: true, recentWorkspaces: [], ...actions } });
    expect(ui.getByRole("dialog", { name: "No workspace loaded" })).toBeInTheDocument();
    expect(ui.getByRole("status")).toHaveTextContent("Not found");
    expect(ui.queryByRole("button", { name: "Set up Jujutsu…" })).not.toBeInTheDocument();
    await fireEvent.input(ui.getByLabelText("Repository path"), { target: { value: " /other " } });
    await fireEvent.click(ui.getByRole("button", { name: "Open workspace" }));
    expect(actions.onOpen).toHaveBeenCalledWith("/other");
});
