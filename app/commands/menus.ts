import { annotationCommands } from "../annotations/commands";
import { appZoom, nativeZoomEnabled, zoomCommands } from "../display/zoom";
import { copyPathCommand } from "../files/editorMenu";
import type { Operand } from "../messages/Operand";
import type { RevChange } from "../messages/RevChange";
import type { RevHeader } from "../messages/RevHeader";
import { pluginCommands, pluginPanels, type PluginEntry } from "../plugins/contributions";
import { owningHeaders } from "../revision/origins";
import { dock, type PanelId } from "../workspace/dock";
import { contextCommands, repositoryCommands, revisionCommands, type Command } from "./registry";
import { get } from "svelte/store";

export type TopMenuId = "repository" | "revision" | "bookmarks" | "tools";

export type MenuEntry = Command & {
    checked?: boolean;
    // modals capture activeElement on open, so the trigger must reclaim focus before execute runs
    opensModal?: boolean;
};

export type MenuSection = {
    items: MenuEntry[];
};

export type DropdownMenu = {
    label: string;
    context?: string | null;
    sections: MenuSection[];
};

export type TopMenu = DropdownMenu & {
    id: TopMenuId;
};

export interface TopMenuInputs {
    headers: RevHeader[];
    operand: Operand | null;
    ignoreImmutable: boolean;
    refreshing: boolean;
    extensions: readonly PluginEntry[];
    onSettings: () => void;
    onHistory: () => void;
    onWorkingCopy: () => void;
    onPanel?: (id: PanelId) => void;
}

export interface FileMenuInputs {
    change: RevChange;
    headers: RevHeader[];
    operand: Operand | null;
}

function byIds(commands: Command[], ids: string[]): MenuEntry[] {
    let result: MenuEntry[] = [];
    for (let id of ids) {
        let match = commands.find(command => command.id === id);
        if (match) result.push(match);
    }
    return result;
}

function disabledEntry(id: string, label: string, icon: string, scope: string, reason: string, destructive = false): MenuEntry {
    return { id, label, icon, scope, destructive, reason, execute: () => {} };
}

export function buildFileActionsMenu(inputs: FileMenuInputs): DropdownMenu {
    let { change, headers, operand } = inputs;
    let hunkOperand = operand?.type === "Change" && operand.hunk && operand.path.repo_path === change.path.repo_path
        ? operand
        : null;
    let owners = owningHeaders(change, headers);
    let changeOperand: Extract<Operand, { type: "Change" }> | null = hunkOperand
        ?? (owners.length ? { type: "Change", headers: owners, path: change.path, hunk: null } : null);
    let changeAll = changeOperand
        ? contextCommands(changeOperand).map(command =>
            command.id === "context-move_to" || command.id === "context-copy_to"
                ? { ...command, opensModal: true }
                : command,
        )
        : [];
    let changeReason = "Select a revision";
    let changeNotes: MenuEntry[] = changeOperand
        ? annotationCommands(changeOperand).map(command => command.id === "annotate" ? { ...command, opensModal: true } : command)
        : [disabledEntry("annotate", "Annotate file…", "message-square", "Annotation", changeReason)];
    let copyPath: MenuEntry = copyPathCommand(change.path.repo_path);

    return {
        label: "Changes",
        context: changeOperand?.hunk ? `${change.path.repo_path} (hunk)` : change.path.repo_path,
        sections: (changeOperand
            ? [
                { items: byIds(changeAll, ["context-file_history", "context-external_diff", "context-external_resolve"]) },
                { items: byIds(changeAll, ["context-squash", "context-restore", "context-move_to", "context-copy_to"]) },
                { items: [...changeNotes, copyPath] },
            ]
            : [
                {
                    items: [
                        disabledEntry("context-file_history", "View file history", "clock", "File", changeReason),
                        disabledEntry("context-external_diff", "Open in external diff tool", "external-link", "File", changeReason),
                        disabledEntry("context-external_resolve", "Resolve in external merge tool", "tool", "File", changeReason),
                    ],
                },
                {
                    items: [
                        disabledEntry("context-squash", "Squash file into parent", "chevrons-up", "File", changeReason),
                        disabledEntry("context-restore", "Restore file from parent", "rotate-ccw", "File", changeReason),
                        disabledEntry("context-move_to", "Move file changes to…", "move", "File", changeReason),
                        disabledEntry("context-copy_to", "Restore file into revision…", "copy", "File", changeReason),
                    ],
                },
                { items: [...changeNotes, copyPath] },
            ]).filter(section => section.items.length > 0),
    };
}

function resolveRefOperand(operand: Operand | null, headers: RevHeader[]): Extract<Operand, { type: "Ref" }> | null {
    if (operand?.type === "Ref") return operand;
    if (headers.length !== 1) return null;
    let refs = headers[0].refs;
    if (refs.length === 1) return { type: "Ref", header: headers[0], ref: refs[0] };
    let locals = refs.filter(ref => ref.type === "LocalBookmark");
    if (locals.length === 1) return { type: "Ref", header: headers[0], ref: locals[0] };
    return null;
}

function revisionSummary(headers: RevHeader[]): string {
    if (!headers.length) return "No revision selected";
    if (headers.length > 1) return `${headers.length} revisions selected`;
    let subject = headers[0].description.lines[0]?.trim() || "(no description)";
    return `${headers[0].id.change.hex.slice(0, 8)} · ${subject}`;
}

export function buildTopMenus(inputs: TopMenuInputs): TopMenu[] {
    let revealPanel = inputs.onPanel ?? ((id: PanelId) => dock.open(id));
    let repoAll = repositoryCommands("").map(command =>
        command.id === "repository.refresh" && inputs.refreshing
            ? { ...command, reason: "Refreshing repository" }
            : command,
    );
    let immutableCommand = repoAll.find(command => command.id === "repository.immutable");
    let workspaceItems = byIds(repoAll, ["repository.new_workspace", "repository.rename_workspace"]).map(item => ({ ...item, opensModal: true }));
    // a checkbox reads its state from aria-checked, so the label stays fixed while the registry's label flips
    let protectionItems: MenuEntry[] = immutableCommand
        ? [{ ...immutableCommand, label: "Override immutability protection", checked: inputs.ignoreImmutable }]
        : [];

    let repositoryMenu: TopMenu = {
        id: "repository",
        label: "Repository",
        sections: [
            { items: byIds(repoAll, ["repository.open", "repository.recent", "repository.init", "repository.clone"]).map(item => ({ ...item, opensModal: true })) },
            { items: workspaceItems },
            { items: byIds(repoAll, ["repository.refresh", "repository.reopen", "repository.fetch", "repository.push"]) },
            {
                items: [
                    ...byIds(repoAll, ["repository.undo", "repository.redo"]),
                    { id: "view.history", label: "Repository history", icon: "clock", scope: "View", reason: null, execute: inputs.onHistory },
                ],
            },
            { items: protectionItems },
            { items: byIds(repoAll, ["repository.close"]) },
        ].filter(section => section.items.length > 0),
    };

    let revAll = revisionCommands(inputs.headers, false);
    let revOperand: Operand | null = inputs.headers.length === 1
        ? { type: "Revision", header: inputs.headers[0] }
        : inputs.headers.length > 1
            ? { type: "Revisions", headers: inputs.headers }
            : null;
    let revNotes: MenuEntry[] = revOperand
        ? annotationCommands(revOperand)
        : [disabledEntry("annotate", "Annotate change…", "message-square", "Annotation", "Select a revision")];
    let evolutionEntry: MenuEntry = {
        id: "view.evolution",
        label: "Change evolution",
        icon: "activity",
        scope: "Revision",
        reason: inputs.headers.length ? null : "Select a revision",
        execute: () => revealPanel("evolution"),
    };

    let revisionMenu: TopMenu = {
        id: "revision",
        label: "Revision",
        context: revisionSummary(inputs.headers),
        sections: [
            { items: byIds(revAll, ["new_child", "edit", "new_parent", "duplicate", "bookmark"]) },
            { items: byIds(revAll, ["squash", "restore", "revert", "split", "move", "insert", "add_parent", "remove_parent"]) },
            { items: [...byIds(revAll, ["copy_change_id", "copy_commit_id"]), evolutionEntry, ...revNotes] },
            { items: byIds(revAll, ["abandon"]) },
        ].filter(section => section.items.length > 0),
    };

    let refOperand = resolveRefOperand(inputs.operand, inputs.headers);
    let refAll = refOperand ? contextCommands(refOperand) : [];
    let refReason = inputs.headers[0]?.refs.length ? "Click a bookmark or tag chip first" : "Select a bookmark or tag";
    let refNotes: MenuEntry[] = refOperand && refOperand.ref.type !== "Tag"
        ? annotationCommands(refOperand)
        : [disabledEntry("annotate", "Annotate bookmark…", "message-square", "Annotation", refOperand?.ref.type === "Tag" ? "Tags cannot be annotated" : refReason)];
    let refLabel = refOperand
        ? (refOperand.ref.type === "Tag"
            ? `Tag ${refOperand.ref.tag_name}`
            : refOperand.ref.type === "RemoteBookmark"
                ? `${refOperand.ref.bookmark_name}@${refOperand.ref.remote_name}`
                : refOperand.ref.bookmark_name)
        : "No bookmark selected";
    let bookmarksMenu: TopMenu = {
        id: "bookmarks",
        label: "Bookmarks",
        context: refLabel,
        sections: [
            { items: byIds(revAll, ["bookmark"]) },
            ...(refOperand
                ? [
                    { items: byIds(refAll, ["context-push-all", "context-push-single", "context-fetch-all", "context-fetch-single"]) },
                    { items: [...byIds(refAll, ["context-track", "context-untrack", "context-rename", "context-move_to"]), ...refNotes] },
                    { items: byIds(refAll, ["context-delete"]) },
                ]
                : [
                    {
                        items: [
                            disabledEntry("context-push-all", "Push bookmark", "arrow-up", "Bookmark", refReason),
                            disabledEntry("context-push-single", "Push bookmark to remote…", "upload-cloud", "Bookmark", refReason),
                            disabledEntry("context-fetch-all", "Fetch bookmark", "arrow-down", "Bookmark", refReason),
                            disabledEntry("context-fetch-single", "Fetch bookmark from remote…", "download-cloud", "Bookmark", refReason),
                        ],
                    },
                    {
                        items: [
                            disabledEntry("context-track", "Track remote bookmark", "link", "Bookmark", refReason),
                            disabledEntry("context-untrack", "Untrack bookmark", "slash", "Bookmark", refReason),
                            disabledEntry("context-rename", "Rename bookmark…", "type", "Bookmark", refReason),
                            disabledEntry("context-move_to", "Move bookmark to…", "move", "Bookmark", refReason),
                            ...refNotes,
                        ],
                    },
                    { items: [disabledEntry("context-delete", "Delete bookmark", "trash-2", "Bookmark", refReason, true)] },
                ]),
        ].filter(section => section.items.length > 0),
    };

    let zoom = zoomCommands(get(appZoom), get(nativeZoomEnabled));
    let extCommands = pluginCommands(inputs.operand, false, inputs.extensions);
    let extPanels = pluginPanels(inputs.extensions).map((view): MenuEntry => ({
        id: `view.${view.id}`, label: view.label, icon: "box", scope: "Plugin", reason: null, execute: () => revealPanel(view.id),
    }));
    let toolsSections: MenuSection[] = [
        {
            items: [
                {
                    id: "tools.commands", label: "Commands…", icon: "command", scope: "Tools", shortcut: "Ctrl/⌘ K", opensModal: true, reason: null,
                    execute: () => { window.dispatchEvent(new Event("gg:open-commands")); },
                },
                {
                    id: "tools.working_copy", label: "Working copy (@)", icon: "at-sign", scope: "Tools", reason: null,
                    execute: inputs.onWorkingCopy,
                },
            ],
        },
        {
            items: [
                { id: "tools.terminal", label: "Terminal", icon: "terminal", scope: "Tools", reason: null, execute: () => revealPanel("terminal") },
                { id: "tools.annotations", label: "Annotations", icon: "message-square", scope: "Tools", reason: null, execute: () => revealPanel("annotations") },
            ],
        },
    ];
    if (zoom.length) toolsSections.push({ items: zoom });
    if (extCommands.length || extPanels.length) toolsSections.push({ items: [...extCommands, ...extPanels] });
    toolsSections.push({
        items: [{ id: "tools.settings", label: "Settings", icon: "settings", scope: "Tools", reason: null, execute: inputs.onSettings }],
    });

    let toolsMenu: TopMenu = {
        id: "tools",
        label: "Tools",
        sections: toolsSections,
    };

    return [repositoryMenu, revisionMenu, bookmarksMenu, toolsMenu];
}
