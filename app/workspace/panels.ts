import { enabled as neovimEnabled } from "virtual:gg-neovim";
import { pluginPanels, type PluginEntry } from "../plugins/contributions";
import type { CorePanelId, PanelId } from "./dock";

export const panelLabel: Record<CorePanelId, string> = {
    timeline: "Timeline",
    terminal: "Terminal",
    settings: "Settings",
    evolution: "Evolution",
    history: "History",
    annotations: "Annotations",
    description: "Description",
    diff: "Diff",
    tree: "Files",
    edit: "Edit",
    operation: "Operation",
    "revision-tools": "Revision tools",
};

export function panelLabelFor(id: PanelId, extensions?: readonly PluginEntry[]): string {
    return panelLabel[id as CorePanelId] ?? pluginPanels(extensions).find(view => view.id === id)?.label ?? "Plugin";
}

export function viewChoices(hasStatus: boolean, extensions = pluginPanels()): { id: PanelId; label: string }[] {
    let choices: { id: PanelId; label: string }[] = ["timeline", "description", "revision-tools", "diff", "tree", "evolution", "history", "annotations", "terminal"].map(id => ({ id: id as PanelId, label: panelLabelFor(id as PanelId) }));
    if (neovimEnabled) choices.push({ id: "edit", label: panelLabel.edit });
    if (hasStatus) choices.push({ id: "operation", label: panelLabel.operation });
    return [...choices, ...extensions.map(view => ({ id: view.id, label: view.label }))];
}
