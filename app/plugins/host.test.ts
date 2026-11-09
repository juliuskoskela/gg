import { afterEach, describe, expect, it, vi } from "vitest";
import { get } from "svelte/store";
import { cleanup, fireEvent, render } from "@testing-library/svelte";
import { createPluginHost, pluginFacts, type HostServices } from "./host";
import { pluginCommands, pluginContributions, pluginPanels } from "./contributions";
import type { ReviewProgress } from "../messages/ReviewProgress";
import type { BundledPlugin, PluginAPI, PluginActivation } from "./types";
import PluginPanel from "./PluginPanel.svelte";
import PluginSettings from "./PluginSettings.svelte";
import { contains, dock } from "../workspace/dock";
import { openViewCommands } from "../workspace/viewCommands";
import TestView from "./test/TestView.svelte";
import FailedView from "./test/FailedView.svelte";

let disposals: (() => void)[] = [];
afterEach(() => { disposals.forEach(dispose => dispose()); disposals = []; cleanup(); });

function setup(plugin: BundledPlugin, overrides: Partial<HostServices> = {}) {
    let services: HostServices = {
        query: vi.fn(async () => ({ type: "data", value: null })) as HostServices["query"],
        annotations: vi.fn(async () => ({ threads: [] })) as unknown as HostServices["annotations"],
        reviews: vi.fn(async () => ({ me: { name: "Julius", email: "test@example.com" }, location: "local", changes: [] })),
        data: vi.fn(async () => ({ value: null, keys: [], facts: [] })),
        notes: vi.fn(async () => ({ type: "List" as const, value: { location: "local", me: { name: "Reviewer", kind: "human" as const }, threads: [] } })),
        navigate: vi.fn(async () => {}),
        split: vi.fn(async () => null),
        openView: vi.fn(async () => {}),
        closeView: vi.fn(), loadEnabled: () => [], saveEnabled: vi.fn(), ...overrides,
    };
    let host = createPluginHost([plugin], services);
    disposals.push(host.dispose);
    host.update({ repository: "repo-a", workspace: "/a", status: undefined });
    return { host, services };
}
function plugin(activate: BundledPlugin["activate"], capabilities: BundledPlugin["manifest"]["capabilities"] = []): BundledPlugin {
    return { manifest: { id: "review", name: "Review", description: "Review changes", version: "1", apiVersion: 1, capabilities }, activate };
}

describe("bundled plugin host", () => {
    it("only activates enabled plugins and scopes storage to their namespace", async () => {
        let api!: PluginAPI;
        let { host, services } = setup(plugin(value => { api = value; return {}; }, ["storage"]));
        expect(get(host.statuses)[0].active).toBe(false);
        host.enable("review", true);
        await vi.waitFor(() => expect(get(host.statuses)[0].active).toBe(true));
        await api.storage.set("session", { result: "reviewed" });
        expect(services.data).toHaveBeenCalledWith("review", { type: "Set", key: "session", value: { result: "reviewed" } }, "/a");
        expect(services.saveEnabled).toHaveBeenCalledWith(["review"]);
        await expect(api.reviews()).rejects.toThrow("reviews.read");
    });

    it("removes views, commands and event subscriptions when disabled", async () => {
        let api!: PluginAPI;
        let dispose = vi.fn(), execute = vi.fn(), observed = vi.fn();
        let { host, services } = setup(plugin(value => {
            api = value;
            api.context.subscribe(observed);
            return { views: [{ id: "session", label: "Review session", component: TestView }], commands: [{ id: "open", label: "Open review", execute, contextMenu: true }], dispose };
        }, ["storage"]));
        host.enable("review", true);
        await vi.waitFor(() => expect(pluginPanels()).toHaveLength(1));
        let command = pluginCommands(null, true)[0];
        render(PluginPanel, { props: { id: "plugin:review:session" } });
        expect(document.body.textContent).toContain("Bundled plugin content");
        expect(document.body.textContent).toContain("Plugin action");
        command.execute();
        expect(execute).toHaveBeenCalledOnce();
        host.enable("review", false);
        expect(get(pluginContributions)).toHaveLength(0);
        expect(services.closeView).toHaveBeenCalledWith("plugin:review:session");
        expect(dispose).toHaveBeenCalledOnce();
        let count = observed.mock.calls.length;
        host.update({ repository: "repo-b", workspace: "/b", status: undefined });
        expect(observed).toHaveBeenCalledTimes(count);
        command.execute();
        expect(execute).toHaveBeenCalledOnce();
        await expect(api.storage.keys()).rejects.toThrow("no longer active");
    });

    it("enables through Settings and opens a contributed dock view through core commands", async () => {
        let { host, services } = setup(plugin(() => ({ views: [{ id: "session", label: "Review session", component: TestView }] }), ["reviews.read"]), {
            closeView: id => dock.close(id),
        });
        let ui = render(PluginSettings, { props: { host } });
        expect(ui.getByLabelText("Review")).not.toBeChecked();
        expect(ui.getByText("Read review progress")).toBeInTheDocument();
        await fireEvent.click(ui.getByLabelText("Review"));
        await vi.waitFor(() => expect(ui.getByText("1 · Active")).toBeInTheDocument());
        let command = openViewCommands(null).find(command => command.id === "view.open.plugin:review:session");
        expect(command).toBeDefined();
        command!.execute();
        expect(contains(get(dock).root, "plugin:review:session")).toBe(true);
        await fireEvent.click(ui.getByLabelText("Review"));
        expect(contains(get(dock).root, "plugin:review:session")).toBe(false);
        command!.execute();
        expect(contains(get(dock).root, "plugin:review:session")).toBe(false);
        expect(services.saveEnabled).toHaveBeenLastCalledWith([]);
    });

    it("restores enabled preferences and updates selection without restarting the plugin", async () => {
        let observed = vi.fn(), activate = vi.fn((api: PluginAPI) => { api.context.subscribe(observed); return {}; });
        let { host } = setup(plugin(activate), { loadEnabled: () => ["review", "removed-plugin"] });
        await vi.waitFor(() => expect(get(host.statuses)[0].active).toBe(true));
        host.update({ repository: "repo-a", workspace: "/a", status: undefined, selection: null });
        expect(activate).toHaveBeenCalledOnce();
        expect(observed).toHaveBeenLastCalledWith({ repository: "repo-a", workspace: "/a", status: undefined, selection: null });
    });

    it("contains a view rendering failure and still permits disabling its owner", async () => {
        let { host } = setup(plugin(() => ({ views: [{ id: "failed", label: "Failed view", component: FailedView }] })));
        host.enable("review", true);
        await vi.waitFor(() => expect(pluginPanels()).toHaveLength(1));
        let ui = render(PluginPanel, { props: { id: "plugin:review:failed" } });
        expect(ui.getByRole("alert")).toHaveTextContent("This plugin view could not be displayed.");
        expect(ui.getByRole("button", { name: "Try again" })).toBeInTheDocument();
        host.enable("review", false);
        expect(get(pluginContributions)).toHaveLength(0);
    });

    it("cleans up a subscriber that disables its plugin during its initial emission", async () => {
        let observed = vi.fn(() => host.enable("review", false));
        let { host } = setup(plugin(api => { api.context.subscribe(observed); return {}; }));
        host.enable("review", true);
        await Promise.resolve();
        expect(get(host.statuses)[0].active).toBe(false);
        host.update({ repository: "repo-b", workspace: "/b", status: undefined });
        expect(observed).toHaveBeenCalledOnce();
    });

    it("contains context subscriber failures and removes the broken instance", async () => {
        let observed = vi.fn((context: { selection?: unknown }) => {
            if (context.selection === null) throw new Error("subscriber failed");
        });
        let { host } = setup(plugin(api => { api.context.subscribe(observed); return {}; }));
        host.enable("review", true);
        await vi.waitFor(() => expect(get(host.statuses)[0].active).toBe(true));
        expect(() => host.update({ repository: "repo-a", workspace: "/a", status: undefined, selection: null })).not.toThrow();
        expect(get(host.statuses)[0].error).toBe("subscriber failed");
        expect(get(host.statuses)[0].active).toBe(false);
        host.update({ repository: "repo-a", workspace: "/a", status: undefined });
        expect(observed).toHaveBeenCalledTimes(2);
    });

    it("pins annotation operations to this plugin, session and workspace", async () => {
        let api!: PluginAPI;
        let { host, services } = setup(plugin(value => { api = value; return {}; }, ["annotations.read", "annotations.write"]));
        host.enable("review", true);
        await api.notes.create("session-one", [], "Question");
        expect(services.notes).toHaveBeenCalledWith("review", "session-one", "/a", { type: "Create", targets: [], body: "Question" });
        await expect(api.notes.export("session-one")).rejects.toThrow("annotations.exchange");
        host.enable("review", false);
        await expect(api.notes.reply("session-one", "thread", "Reply")).rejects.toThrow("no longer active");
    });

    it("rechecks navigation before touching core and only opens owned views", async () => {
        let api!: PluginAPI;
        let finish!: () => void;
        let changed = false;
        let { host, services } = setup(plugin(value => { api = value; return { views: [{ id: "session", label: "Review", component: TestView }] }; }, ["navigation"]), {
            navigate: async (_id, _path, validate) => { await new Promise<void>(resolve => finish = resolve); validate(); changed = true; },
        });
        host.enable("review", true);
        await vi.waitFor(() => expect(get(host.statuses)[0].active).toBe(true));
        await api.navigation.openView("session");
        expect(services.openView).toHaveBeenCalledWith("plugin:review:session");
        await expect(api.navigation.openView("other-plugin:view")).rejects.toThrow("Unknown plugin view");
        let pending = api.navigation.select({} as never);
        host.enable("review", false);
        finish();
        await expect(pending).rejects.toThrow("no longer active");
        expect(changed).toBe(false);
    });

    it("guards split requests and the confirmation callback after disable", async () => {
        let api!: PluginAPI;
        let confirm!: () => void;
        let changed = false;
        let { host } = setup(plugin(value => { api = value; return {}; }, ["navigation", "queries.read"]), {
            split: async (_id, validate) => { await new Promise<void>(resolve => confirm = resolve); validate(); changed = true; return null; },
        });
        host.enable("review", true);
        await vi.waitFor(() => expect(get(host.statuses)[0].active).toBe(true));
        await expect(api.query("query_split_receipts", { ids: [] })).resolves.toMatchObject({ type: "data" });
        await expect(api.query("query_split_receipt_states", { ids: [] })).resolves.toMatchObject({ type: "data" });
        let pending = api.navigation.split({} as never);
        host.enable("review", false); confirm();
        await expect(pending).rejects.toThrow("no longer active");
        expect(changed).toBe(false);
    });

    it("does not register an activation that resolves after disabling", async () => {
        let finish!: (value: PluginActivation) => void;
        let dispose = vi.fn();
        let { host } = setup(plugin(() => new Promise(resolve => finish = resolve)));
        host.enable("review", true);
        host.enable("review", false);
        finish({ views: [{ id: "late", label: "Late", component: TestView }], dispose });
        await vi.waitFor(() => expect(dispose).toHaveBeenCalledOnce());
        expect(pluginPanels()).toHaveLength(0);
        expect(get(host.statuses)[0].active).toBe(false);
    });

    it("recreates instances on repository changes and rejects results from the old repository", async () => {
        let apis: PluginAPI[] = [];
        let finish!: (value: ReviewProgress) => void;
        let { host } = setup(plugin(api => { apis.push(api); return {}; }, ["reviews.read"]), {
            reviews: () => new Promise(resolve => finish = resolve),
        });
        host.enable("review", true);
        await vi.waitFor(() => expect(get(host.statuses)[0].active).toBe(true));
        let pending = apis[0].reviews();
        host.update({ repository: "repo-b", workspace: "/b", status: undefined });
        finish({ me: { name: "Julius", email: "test@example.com" }, location: "local", changes: [] });
        await expect(pending).rejects.toThrow("no longer active");
        expect(apis).toHaveLength(2);
        expect(get(apis[1].context).repository).toBe("repo-b");
    });

    it("validates read commands at runtime and emits recorded facts to core", async () => {
        let api!: PluginAPI;
        let fact = { id: "one", plugin: "review", kind: "merged", at: "now", data: true };
        let { host, services } = setup(plugin(value => { api = value; return {}; }, ["queries.read", "facts.publish"]), {
            data: vi.fn(async () => ({ value: null, keys: [], facts: [fact] })),
        });
        host.enable("review", true);
        await expect(api.query("abandon_revisions" as never, {})).rejects.toThrow("Not a plugin read query");
        expect(services.query).not.toHaveBeenCalled();
        await api.publish("merged", true);
        expect(get(pluginFacts)).toEqual({ repository: "repo-a", fact });
        host.update({ repository: "repo-b", workspace: "/b", status: undefined });
        expect(get(pluginFacts)).toBeNull();
    });

    it("isolates activation failures and validates manifest identities", async () => {
        let { host } = setup(plugin(() => { throw new Error("failed activation"); }));
        host.enable("review", true);
        await vi.waitFor(() => expect(get(host.statuses)[0].error).toBe("failed activation"));
        expect(get(host.statuses)[0].active).toBe(false);
        let invalid = plugin(() => ({}));
        invalid.manifest.id = "../escape";
        expect(() => createPluginHost([invalid], {} as HostServices)).toThrow("Invalid bundled plugin");
    });
});
