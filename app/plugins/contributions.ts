import { get, writable, type Readable } from "svelte/store";
import type { Command } from "../commands/registry";
import type { Operand } from "../messages/Operand";
import type { PluginAPI, PluginActivation } from "./types";

export type PluginPanelId = `plugin:${string}:${string}`;
export type PluginEntry = { plugin: string; api: PluginAPI; activation: PluginActivation };
let entries = writable<readonly PluginEntry[]>([]);
export let pluginContributions: Readable<readonly PluginEntry[]> = { subscribe: entries.subscribe };
export function isPluginPanelId(value: unknown): value is PluginPanelId {
    return typeof value === "string" && /^plugin:[a-z][a-z0-9-]*:[a-z][a-z0-9-]*$/.test(value);
}
export function pluginPanelId(plugin: string, view: string): PluginPanelId { return `plugin:${plugin}:${view}`; }
export function pluginPanels(source: readonly PluginEntry[] = get(entries)) {
    return source.flatMap(entry => (entry.activation.views ?? []).map(view => ({
        ...view, id: pluginPanelId(entry.plugin, view.id), api: entry.api,
    })));
}
export function registerContributions(entry: PluginEntry) {
    let names = [...(entry.activation.views ?? []), ...(entry.activation.commands ?? [])].map(item => item.id);
    if (names.some(name => !/^[a-z][a-z0-9-]*$/.test(name)) || new Set(names).size !== names.length) throw new Error("Plugin contributions need unique local identifiers");
    if (get(entries).some(current => current.plugin === entry.plugin)) throw new Error("Plugin is already active");
    entries.update(current => [...current, entry]);
    let disposed = false;
    return () => {
        if (disposed) return;
        disposed = true;
        entries.update(current => current.filter(candidate => candidate !== entry));
    };
}
export function pluginCommands(operand: Operand | null, contextMenu = false, source: readonly PluginEntry[] = get(entries)): Command[] {
    return source.flatMap(entry => (entry.activation.commands ?? [])
        .filter(command => !contextMenu || command.contextMenu)
        .map(command => ({
            id: `plugin.${entry.plugin}.${command.id}`, label: command.label, icon: command.icon ?? "box",
            scope: entry.plugin, group: 100, reason: command.available && !command.available(operand) ? "Not available for this selection" : null,
            execute: () => {
                if (!get(entries).includes(entry) || command.available && !command.available(operand)) return;
                return command.execute(operand);
            },
        })));
}
