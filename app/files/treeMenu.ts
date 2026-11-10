import { subjectOf } from "../annotations/anchors";
import { targetCommands } from "../annotations/commands";
import type { Command } from "../commands/registry";
import { EDIT_GROUP } from "../commands/textCommands";
import type { RevChange } from "../messages/RevChange";
import type { RevHeader } from "../messages/RevHeader";
import type { TreeRow } from "../revision/repositoryTree";
import { copyPathCommand } from "./editorMenu";

export interface TreeMenuInput {
    row: TreeRow;
    /** the working copy's header; without one nothing can be annotated */
    header?: RevHeader;
    onOpen: (path: string) => void;
    onOpenDiff: (change: RevChange) => void;
    /** what the tree itself can do to a folder, such as expanding it */
    folder?: Command[];
}

export function treeCommands({ row, header, onOpen, onOpenDiff, folder = [] }: TreeMenuInput): Command[] {
    if (row.kind === "folder") return [...folder, copyPathCommand(row.path)];
    let commands: Command[] = [];
    if (header) {
        let target = { anchor: { kind: "file" as const, change_id: header.id.change.hex, commit_id: header.id.commit.hex, path: row.path }, subject: subjectOf(header) };
        commands.push(...targetCommands(() => [target], "Annotate file…"));
    }
    commands.push({ id: "file.open", label: "Open", icon: "file-text", scope: "File", group: EDIT_GROUP, reason: null, execute: () => onOpen(row.path) });
    if (row.change) {
        let change = row.change;
        commands.push({ id: "file.open-diff", label: "Open diff", icon: "columns", scope: "File", group: EDIT_GROUP, reason: null, execute: () => onOpenDiff(change) });
    }
    commands.push(copyPathCommand(row.path));
    return commands;
}
