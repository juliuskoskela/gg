import { isPluginPanelId, pluginPanels, type PluginEntry } from "../plugins/contributions";
import { get, writable } from "svelte/store";
import type { Command } from "../commands/registry";
import { repoStatusEvent } from "../stores";
import { contains, dock, type PanelId } from "./dock";
import { viewChoices } from "./panels";

/** the dock group a context menu was opened in, so a new view can join it */
export let menuPanel = writable<PanelId | null>(null);

/** views that aren't open yet, opening as a tab beside the panel that was right-clicked */
export function openViewCommands(target: PanelId | null = get(menuPanel), extensions?: readonly PluginEntry[]): Command[] {
    let root = get(dock).root;
    let closed = viewChoices(!!get(repoStatusEvent), pluginPanels(extensions)).filter(choice => !contains(root, choice.id));
    if (!closed.length) return [{ id: "view.none", label: "All views are open", icon: "layers", scope: "View", reason: "All views are open", execute: () => {} }];
    return closed.map(choice => ({
        id: `view.open.${choice.id}`, label: `Open ${choice.label}`, icon: "plus", scope: "View", reason: null,
        execute: () => {
            if (isPluginPanelId(choice.id) && !pluginPanels().some(view => view.id === choice.id)) return;
            dock.open(choice.id);
            if (target && target !== choice.id && contains(get(dock).root, target)) dock.move(choice.id, target, "tab");
        },
    }));
}
