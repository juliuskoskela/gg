import { writable } from "svelte/store";

export type BottomToolId =
    | "remote"
    | "fetch"
    | "push"
    | "refresh"
    | "undo"
    | "redo"
    | "immutable"
    | "new_child"
    | "edit"
    | "squash"
    | "split"
    | "bookmark"
    | "abandon"
    | "working_copy"
    | "commands"
    | "terminal"
    | "annotations"
    | "history";

export type BottomToolbarSide = "left" | "right";

export type BottomToolbarConfig = {
    left: BottomToolId[];
    right: BottomToolId[];
};

export type BottomToolDefinition = {
    id: BottomToolId;
    label: string;
    settingLabel: string;
    tip: string;
    icon: string;
    category: "Repository" | "Revision" | "Tools";
};

export let BOTTOM_TOOLS: BottomToolDefinition[] = [
    { id: "remote", label: "Remote", settingLabel: "Upstream remote selector", tip: "Git remote", icon: "globe", category: "Repository" },
    { id: "fetch", label: "Fetch", settingLabel: "Fetch remote bookmarks", tip: "Fetch remote bookmarks", icon: "arrow-down", category: "Repository" },
    { id: "push", label: "Push", settingLabel: "Push all bookmarks", tip: "Push all bookmarks", icon: "arrow-up", category: "Repository" },
    { id: "refresh", label: "Refresh", settingLabel: "Refresh repository", tip: "Refresh repository", icon: "refresh-cw", category: "Repository" },
    { id: "undo", label: "Undo", settingLabel: "Undo operation", tip: "Undo the latest operation", icon: "rotate-ccw", category: "Repository" },
    { id: "redo", label: "Redo", settingLabel: "Redo operation", tip: "Redo the latest undone operation", icon: "rotate-cw", category: "Repository" },
    { id: "immutable", label: "Immutability", settingLabel: "Override immutability", tip: "Override immutability protection", icon: "shield", category: "Repository" },
    { id: "new_child", label: "New", settingLabel: "New child revision", tip: "New child", icon: "plus", category: "Revision" },
    { id: "edit", label: "Edit", settingLabel: "Edit as working copy", tip: "Edit as working copy", icon: "edit-3", category: "Revision" },
    { id: "squash", label: "Squash", settingLabel: "Squash into parent", tip: "Squash into parent", icon: "chevrons-up", category: "Revision" },
    { id: "split", label: "Split", settingLabel: "Split change", tip: "Split change…", icon: "scissors", category: "Revision" },
    { id: "bookmark", label: "Bookmark", settingLabel: "Create bookmark", tip: "Create bookmark…", icon: "bookmark", category: "Revision" },
    { id: "abandon", label: "Abandon", settingLabel: "Abandon revision", tip: "Abandon", icon: "trash-2", category: "Revision" },
    { id: "working_copy", label: "Working copy", settingLabel: "Working copy (@)", tip: "Select working copy (@)", icon: "at-sign", category: "Tools" },
    { id: "commands", label: "Commands", settingLabel: "Command palette", tip: "Open commands (Ctrl/⌘ K)", icon: "command", category: "Tools" },
    { id: "terminal", label: "Terminal", settingLabel: "Terminal view", tip: "Open Terminal", icon: "terminal", category: "Tools" },
    { id: "annotations", label: "Annotations", settingLabel: "Annotations view", tip: "Open Annotations", icon: "message-square", category: "Tools" },
    { id: "history", label: "History", settingLabel: "Repository history view", tip: "Open Repository history", icon: "clock", category: "Tools" },
];

let TOOL_IDS = new Set<string>(BOTTOM_TOOLS.map(tool => tool.id));
let STORAGE_KEY = "gg.ui.bottom-toolbar";

export let DEFAULT_BOTTOM_TOOLBAR: BottomToolbarConfig = {
    left: ["remote", "fetch", "push"],
    right: ["undo", "redo"],
};

export function isBottomToolId(value: unknown): value is BottomToolId {
    return typeof value === "string" && TOOL_IDS.has(value);
}

export function bottomToolFor(id: BottomToolId): BottomToolDefinition {
    return BOTTOM_TOOLS.find(tool => tool.id === id)!;
}

export function isDefaultBottomToolbar(config: BottomToolbarConfig): boolean {
    return config.left.length === DEFAULT_BOTTOM_TOOLBAR.left.length
        && config.right.length === DEFAULT_BOTTOM_TOOLBAR.right.length
        && config.left.every((id, index) => id === DEFAULT_BOTTOM_TOOLBAR.left[index])
        && config.right.every((id, index) => id === DEFAULT_BOTTOM_TOOLBAR.right[index]);
}

function cloneDefault(): BottomToolbarConfig {
    return { left: [...DEFAULT_BOTTOM_TOOLBAR.left], right: [...DEFAULT_BOTTOM_TOOLBAR.right] };
}

// left/right name the ends in left-to-right layouts; RTL mirrors them like the rest of the chrome
export function parseBottomToolbar(raw: string | null): BottomToolbarConfig {
    let parsed: unknown;
    try { parsed = JSON.parse(raw ?? "null"); } catch { return cloneDefault(); }
    if (!parsed || typeof parsed !== "object") return cloneDefault();
    let record = parsed as Record<string, unknown>;
    if (record.version !== 1 || !Array.isArray(record.left) || !Array.isArray(record.right)) return cloneDefault();
    let seen = new Set<BottomToolId>();
    let take = (list: unknown[]): BottomToolId[] => {
        let out: BottomToolId[] = [];
        for (let item of list) {
            if (isBottomToolId(item) && !seen.has(item)) {
                seen.add(item);
                out.push(item);
            }
        }
        return out;
    };
    let config = { left: take(record.left), right: take(record.right) };
    // an emptied toolbar is a choice, but one whose every tool is unknown is a stale or foreign value
    if (!seen.size && record.left.length + record.right.length > 0) return cloneDefault();
    return config;
}

function loadFromStorage(storage?: Pick<Storage, "getItem"> | null): BottomToolbarConfig {
    try { return parseBottomToolbar(storage?.getItem(STORAGE_KEY) ?? null); }
    catch { return cloneDefault(); }
}

export function createBottomToolbarStore(storage?: Pick<Storage, "getItem" | "setItem" | "removeItem"> | null) {
    let store = writable<BottomToolbarConfig>(loadFromStorage(storage));

    function save(next: BottomToolbarConfig) {
        try {
            if (isDefaultBottomToolbar(next)) storage?.removeItem(STORAGE_KEY);
            else storage?.setItem(STORAGE_KEY, JSON.stringify({ version: 1, ...next }));
        } catch { /* retain in-memory configuration */ }
    }

    function change(update: (current: BottomToolbarConfig) => BottomToolbarConfig) {
        store.update(current => {
            let next = update(current);
            if (next !== current) save(next);
            return next;
        });
    }

    return {
        subscribe: store.subscribe,
        add(side: BottomToolbarSide, id: BottomToolId) {
            change(current => current.left.includes(id) || current.right.includes(id)
                ? current
                : { ...current, [side]: [...current[side], id] });
        },
        remove(id: BottomToolId) {
            change(current => current.left.includes(id) || current.right.includes(id)
                ? { left: current.left.filter(item => item !== id), right: current.right.filter(item => item !== id) }
                : current);
        },
        move(id: BottomToolId, delta: -1 | 1) {
            change(current => {
                let side: BottomToolbarSide = current.left.includes(id) ? "left" : "right";
                let index = current[side].indexOf(id);
                let target = index + delta;
                if (index < 0 || target < 0 || target >= current[side].length) return current;
                let list = [...current[side]];
                list.splice(index, 1);
                list.splice(target, 0, id);
                return { ...current, [side]: list };
            });
        },
        moveToSide(id: BottomToolId, destination: BottomToolbarSide) {
            let source: BottomToolbarSide = destination === "left" ? "right" : "left";
            change(current => current[source].includes(id)
                ? { ...current, [source]: current[source].filter(item => item !== id), [destination]: [...current[destination], id] }
                : current);
        },
        reset() {
            change(() => cloneDefault());
        },
    };
}

export let bottomToolbar = createBottomToolbarStore(typeof localStorage === "undefined" ? null : localStorage);
