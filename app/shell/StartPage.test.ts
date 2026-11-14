import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/svelte";
import { tick } from "svelte";
import StartPage from "./StartPage.svelte";
import type { LoadError } from "./start";

afterEach(cleanup);

let config = (fields: Partial<LoadError> = {}): LoadError => ({ type: "LoadError", absolute_path: "/home/ada/site", message: "no repo", kind: "Uninitialized", home_dir: "/home/ada", ...fields });
let callbacks = () => ({ onOpen: vi.fn(), onInit: vi.fn(async () => null as string | null), onChoose: vi.fn(), onInitialize: vi.fn(), onClone: vi.fn() });

it("asks to initialize a plain folder with colocation on", async () => {
    let actions = callbacks();
    let ui = render(StartPage, { props: { config: config(), desktop: false, recentWorkspaces: [], ...actions } });
    let prompt = ui.getByRole("region", { name: "Initialize a repository in site" });
    expect(prompt).toHaveTextContent("~/site");
    let colocate = ui.getByRole("checkbox", { name: /Colocate with Git/ });
    expect(colocate).toBeChecked();
    expect(colocate).toBeEnabled();
    expect(ui.getByText("Git tools keep working in this folder.")).toBeInTheDocument();
    await fireEvent.click(colocate);
    await fireEvent.click(ui.getByRole("button", { name: "Initialize repository" }));
    expect(actions.onInit).toHaveBeenCalledWith("/home/ada/site", false);
});

it("sets up Jujutsu at a Git checkout's root and keeps colocation for its history", async () => {
    let actions = callbacks();
    let ui = render(StartPage, { props: { config: config({ absolute_path: "/home/ada/site/docs", git_root: "/home/ada/site" }), desktop: true, recentWorkspaces: [], ...actions } });
    let prompt = ui.getByRole("region", { name: "Set up Jujutsu in site" });
    expect(prompt).toHaveTextContent("This folder is inside a Git repository.");
    expect(prompt).toHaveTextContent("keeps its Git history. Git and jj stay in sync.");
    let colocate = ui.getByRole("checkbox", { name: /Colocate with Git/ });
    expect(colocate).toBeChecked();
    expect(colocate).toBeDisabled();
    await fireEvent.click(ui.getByRole("button", { name: "Initialize repository" }));
    expect(actions.onInit).toHaveBeenCalledWith("/home/ada/site", true);
});

it("shows an initialization error in place and keeps a way back", async () => {
    let actions = callbacks();
    let resolve!: (message: string | null) => void;
    actions.onInit.mockImplementation(() => new Promise(done => resolve = done));
    let ui = render(StartPage, { props: { config: config(), desktop: false, recentWorkspaces: [], ...actions } });
    await fireEvent.click(ui.getByRole("button", { name: "Initialize repository" }));
    expect(ui.getByRole("button", { name: "Initializing…" })).toBeDisabled();
    resolve("Couldn't read ~/site: Permission denied");
    await vi.waitFor(() => expect(ui.getByRole("alert")).toHaveTextContent("Permission denied"));
    expect(ui.getByRole("button", { name: "Initialize repository" })).toBeEnabled();

    await fireEvent.click(ui.getByRole("button", { name: "Choose another folder" }));
    let path = ui.getByRole("textbox", { name: "Folder" });
    expect(path).toHaveValue("/home/ada/site");
    expect(ui.queryByRole("region", { name: /Initialize a repository/ })).not.toBeInTheDocument();
    await fireEvent.input(path, { target: { value: " /home/ada/other " } });
    await fireEvent.click(ui.getByRole("button", { name: "Open" }));
    expect(actions.onOpen).toHaveBeenCalledWith("/home/ada/other");
});

it("offers the prompt again for the next folder opened after going back", async () => {
    let actions = callbacks();
    let ui = render(StartPage, { props: { config: config(), desktop: false, recentWorkspaces: [], ...actions } });
    await fireEvent.click(ui.getByRole("button", { name: "Choose another folder" }));
    await ui.rerender({ config: config({ absolute_path: "/home/ada/next" }) });
    await tick();
    expect(ui.getByRole("region", { name: "Initialize a repository in next" })).toBeInTheDocument();
});

it("explains a missing folder without offering to initialize", () => {
    let ui = render(StartPage, { props: { config: config({ kind: "NotFound", absolute_path: "/home/ada/gone" }), desktop: true, recentWorkspaces: ["/home/ada/gone"], ...callbacks() } });
    expect(ui.getByRole("alert")).toHaveTextContent("~/gone no longer exists.");
    expect(ui.queryByRole("button", { name: "Initialize repository" })).not.toBeInTheDocument();
    expect(ui.getByRole("button", { name: "Choose folder…" })).toBeInTheDocument();
});

it("hides the desktop actions in the browser", () => {
    let ui = render(StartPage, { props: { config: config({ kind: "Other" }), desktop: false, recentWorkspaces: [], ...callbacks() } });
    expect(ui.queryByRole("button", { name: "Choose folder…" })).not.toBeInTheDocument();
    expect(ui.queryByRole("button", { name: "Clone repository…" })).not.toBeInTheDocument();
});

it("lists recent workspaces by folder name with the full path for tools and screen readers", async () => {
    let actions = callbacks();
    let ui = render(StartPage, { props: { config: config({ kind: "Other" }), desktop: false, recentWorkspaces: ["/home/ada/code/gg", "/srv/shared/site", "/home/ada/code/gg"], ...actions } });
    let rows = ui.getAllByRole("button", { name: /, \// }).filter(row => row.hasAttribute("data-recent"));
    expect(rows.map(row => row.getAttribute("aria-label"))).toEqual(["gg, /home/ada/code/gg", "site, /srv/shared/site"]);
    expect(rows[0]).toHaveAttribute("title", "/home/ada/code/gg");
    expect(rows[0]).toHaveTextContent("~/code");
    rows[0].focus();
    await fireEvent.keyDown(rows[0], { key: "ArrowDown" });
    expect(document.activeElement).toBe(rows[1]);
    expect(actions.onOpen).not.toHaveBeenCalled();
    await fireEvent.click(rows[1]);
    expect(actions.onOpen).toHaveBeenCalledWith("/srv/shared/site");
});
