import { enabled as neovimEnabled } from "virtual:gg-neovim";
import type { PanelId } from "./dock";

export const panelLabel: Record<PanelId, string> = {
    timeline: "Timeline",
    settings: "Settings",
    evolution: "Evolution",
    history: "History",
    description: "Description",
    diff: "Diff",
    tree: "Files",
    edit: "Edit",
    operation: "Operation",
    "revision-tools": "Revision tools",
};

export function viewChoices(hasStatus: boolean): { id: PanelId; label: string }[] {
    let choices: { id: PanelId; label: string }[] = ["timeline", "description", "revision-tools", "diff", "tree", "evolution", "history"].map(id => ({ id: id as PanelId, label: panelLabel[id as PanelId] }));
    if (neovimEnabled) choices.push({ id: "edit", label: panelLabel.edit });
    if (hasStatus) choices.push({ id: "operation", label: panelLabel.operation });
    return choices;
}
