import { enabled as neovimEnabled } from "virtual:gg-neovim";
import type { PanelId } from "./dock";

export const panelLabel: Record<PanelId, string> = {
    timeline: "Timeline",
    review: "Review",
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

export function viewChoices(hasStatus: boolean, withReview = true): { id: PanelId; label: string }[] {
    let choices: { id: PanelId; label: string }[] = ["timeline", "description", "revision-tools", "diff", "tree", "evolution", "history"].map(id => ({ id: id as PanelId, label: panelLabel[id as PanelId] }));
    if (withReview) choices.push({ id: "review", label: panelLabel.review });
    if (neovimEnabled) choices.push({ id: "edit", label: panelLabel.edit });
    if (hasStatus) choices.push({ id: "operation", label: panelLabel.operation });
    return choices;
}
