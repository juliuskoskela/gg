import { writable, type Readable } from "svelte/store";
import type { PluginNoteAction } from "../messages/PluginNoteAction";
import type { PluginNotesResponse } from "../messages/PluginNotesResponse";
import type { RevId } from "../messages/RevId";
import type { AnnotationList } from "../messages/AnnotationList";
import type { PluginOperation } from "../messages/PluginOperation";
import type { PluginData } from "../messages/PluginData";
import type { PluginFact } from "../messages/PluginFact";
import { registerContributions, pluginPanelId } from "./contributions";
import type { BundledPlugin, Capability, PluginAPI, PluginContext, PluginActivation, ReadCommand } from "./types";

let capabilities: Capability[] = ["queries.read", "navigation", "annotations.write", "annotations.exchange", "annotations.read", "reviews.read", "storage", "facts.publish"];
let readCommands: ReadCommand[] = ["query_revisions", "query_revision_summary", "query_revision_diff", "query_review_delta", "query_evolution", "query_operation_history", "query_operation_detail", "query_remotes", "resolve_revision_selection"];
export interface PluginStatus { manifest: BundledPlugin["manifest"]; enabled: boolean; active: boolean; starting: boolean; error?: string; }
export interface HostServices {
    query: PluginAPI["query"];
    annotations: PluginAPI["annotations"];
    reviews: PluginAPI["reviews"];
    data: (plugin: string, operation: PluginOperation, workspace: string) => Promise<PluginData>;
    notes: (plugin: string, context: string, workspace: string, action: PluginNoteAction) => Promise<PluginNotesResponse>;
    navigate: (id: RevId, path: string | undefined, validate: () => void) => Promise<void>;
    openView: (id: ReturnType<typeof pluginPanelId>) => Promise<void>;
    closeView: (id: ReturnType<typeof pluginPanelId>) => void;
    loadEnabled: () => string[];
    saveEnabled: (ids: string[]) => void;
}
export type PluginFactEvent = { repository: string; fact: PluginFact };
let facts = writable<PluginFactEvent | null>(null);
export let pluginFacts: Readable<PluginFactEvent | null> = { subscribe: facts.subscribe };

export function createPluginHost(plugins: readonly BundledPlugin[], services: HostServices) {
    let ids = new Set<string>();
    for (let { manifest } of plugins) {
        if (!/^[a-z][a-z0-9-]*$/.test(manifest.id) || ids.has(manifest.id) || manifest.apiVersion !== 1 ||
            manifest.capabilities.some(capability => !capabilities.includes(capability))) throw new Error("Invalid bundled plugin manifest");
        ids.add(manifest.id);
    }
    let enabled = new Set(services.loadEnabled().filter(id => ids.has(id)));
    let context = writable<PluginContext>({ repository: "", workspace: "", status: undefined });
    let statuses = writable<PluginStatus[]>(plugins.map(plugin => ({ manifest: plugin.manifest, enabled: enabled.has(plugin.manifest.id), active: false, starting: false })));
    let lifetimes = new Map<string, { stop: () => void }>();
    let destroyed = false;
    let repository = "";
    let workspace = "";

    function state(id: string, patch: Partial<PluginStatus>) {
        statuses.update(current => current.map(item => item.manifest.id === id ? { ...item, ...patch } : item));
    }
    function stop(plugin: BundledPlugin) {
        lifetimes.get(plugin.manifest.id)?.stop();
        lifetimes.delete(plugin.manifest.id);
        state(plugin.manifest.id, { active: false, starting: false });
    }
    async function start(plugin: BundledPlugin) {
        let id = plugin.manifest.id;
        let alive = true;
        let disposeActivation: (() => void) | undefined;
        let remove: (() => void) | undefined;
        let views: PluginActivation["views"];
        let listeners = new Set<() => void>();
        let boundRepository = repository, boundWorkspace = workspace;
        let guard = (capability: Capability) => {
            if (!alive || destroyed || repository !== boundRepository) throw new Error("Plugin instance is no longer active");
            if (!plugin.manifest.capabilities.includes(capability)) throw new Error(`Plugin lacks ${capability} capability`);
        };
        async function call<T>(capability: Capability, action: () => Promise<T>) {
            guard(capability);
            let value = await action();
            guard(capability);
            return value;
        }
        let data = (operation: PluginOperation) => call("storage", () => services.data(id, operation, boundWorkspace));
        let notes = (context: string, action: PluginNoteAction, capability: Capability) => call(capability, () => services.notes(id, context, boundWorkspace, action));
        async function noteList(context: string, action: PluginNoteAction, capability: Capability): Promise<AnnotationList> {
            let result = await notes(context, action, capability);
            if (result.type !== "List") throw new Error("Invalid annotation response");
            return result.value;
        }
        let api: PluginAPI = {
            context: { subscribe: run => {
                if (!alive) throw new Error("Plugin instance is no longer active");
                let unsubscribe = context.subscribe(value => {
                    if (!alive) return;
                    try { run(value); }
                    catch (error) {
                        stop(plugin);
                        state(id, { error: error instanceof Error ? error.message : String(error) });
                    }
                });
                // subscribe emits immediately, and its callback can stop this instance.
                if (alive) listeners.add(unsubscribe); else unsubscribe();
                return () => { listeners.delete(unsubscribe); unsubscribe(); };
            } },
            query: (command, args) => call("queries.read", () => {
                if (!readCommands.includes(command)) throw new Error("Not a plugin read query");
                return services.query(command, args);
            }),
            annotations: () => call("annotations.read", services.annotations),
            reviews: () => call("reviews.read", services.reviews),
            navigation: {
                select: (selected, path) => call("navigation", () => services.navigate(selected, path, () => guard("navigation"))),
                openView: view => call("navigation", async () => {
                    if (!views?.some(item => item.id === view)) throw new Error("Unknown plugin view");
                    await services.openView(pluginPanelId(id, view));
                }),
            },
            notes: {
                list: context => noteList(context, { type: "List" }, "annotations.read"),
                create: (context, targets, body) => noteList(context, { type: "Create", targets, body }, "annotations.write"),
                reply: (context, thread, body) => noteList(context, { type: "Reply", id: thread, body }, "annotations.write"),
                edit: (context, thread, post, body) => noteList(context, { type: "Edit", id: thread, post, body }, "annotations.write"),
                setStatus: (context, thread, status) => noteList(context, { type: "SetStatus", id: thread, status }, "annotations.write"),
                export: async context => {
                    let result = await notes(context, { type: "Export" }, "annotations.exchange");
                    if (result.type !== "Bundle") throw new Error("Invalid annotation export");
                    return result.value;
                },
                import: (context, bundle) => noteList(context, { type: "Import", bundle }, "annotations.exchange"),
            },
            storage: {
                get: async key => (await data({ type: "Get", key })).value,
                set: async (key, value) => { await data({ type: "Set", key, value }); },
                delete: async key => { await data({ type: "Delete", key }); },
                keys: async () => (await data({ type: "Keys" })).keys,
            },
            publish: (kind, value) => call("facts.publish", async () => {
                let result = await services.data(id, { type: "Publish", kind, data: value }, boundWorkspace);
                guard("facts.publish");
                let fact = result.facts[0];
                if (!fact) throw new Error("Plugin fact was not recorded");
                facts.set({ repository: boundRepository, fact });
                return fact;
            }),
        };
        lifetimes.set(id, { stop: () => {
            alive = false;
            for (let unsubscribe of listeners) unsubscribe();
            listeners.clear();
            remove?.();
            for (let view of views ?? []) services.closeView(pluginPanelId(id, view.id));
            try { disposeActivation?.(); } catch (error) { state(id, { error: String(error) }); }
        } });
        state(id, { error: undefined, starting: true });
        try {
            let activation = await plugin.activate(api);
            if (!alive || destroyed) { activation.dispose?.(); return; }
            views = activation.views;
            disposeActivation = activation.dispose;
            remove = registerContributions({ plugin: id, api, activation });
            state(id, { active: true, starting: false });
        } catch (error) {
            if (!alive) return;
            stop(plugin);
            state(id, { error: error instanceof Error ? error.message : String(error) });
        }
    }
    return {
        statuses: { subscribe: statuses.subscribe } as Readable<PluginStatus[]>,
        update(next: PluginContext) {
            if (destroyed) return;
            let changed = next.repository !== repository;
            if (changed) {
                for (let plugin of plugins) stop(plugin);
                facts.set(null);
            }
            repository = next.repository;
            workspace = next.workspace;
            context.set(next);
            if (changed && repository) for (let plugin of plugins) if (enabled.has(plugin.manifest.id)) void start(plugin);
        },
        enable(id: string, value: boolean) {
            if (destroyed) return;
            let plugin = plugins.find(plugin => plugin.manifest.id === id);
            if (!plugin) throw new Error("Unknown bundled plugin");
            if (value === enabled.has(id)) return;
            if (value) enabled.add(id); else enabled.delete(id);
            services.saveEnabled([...enabled]);
            state(id, { enabled: value });
            if (!value) stop(plugin);
            else if (repository) void start(plugin);
        },
        dispose() {
            if (destroyed) return;
            destroyed = true;
            for (let plugin of plugins) stop(plugin);
            facts.set(null);
            context.set({ repository: "", workspace: "", status: undefined });
        },
    };
}
