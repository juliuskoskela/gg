import { writable, type Writable } from "svelte/store";

export type PanelId = "timeline" | "description" | "diff" | "tree" | "edit" | "operation" | "revision-tools" | "settings" | "evolution" | "history";
export type Edge = "tab" | "tab-end" | "left" | "right" | "top" | "bottom";
export type DockNode =
    | { type: "split"; direction: "row" | "column"; ratio: number; first: DockNode; second: DockNode }
    | { type: "tabs"; active: PanelId; panels: PanelId[] };
export type DockState = { root: DockNode | null; compactActive: PanelId | null };

let PANEL_IDS: PanelId[] = ["timeline", "description", "diff", "tree", "edit", "operation", "revision-tools", "settings", "evolution", "history"];
const STORAGE_KEY = "gg.dock.layout";

const slot: Record<PanelId, { beside: PanelId | null; edge: Edge }> = {
    timeline: { beside: null, edge: "left" },
    description: { beside: "timeline", edge: "right" },
    diff: { beside: "description", edge: "bottom" },
    tree: { beside: "diff", edge: "left" },
    edit: { beside: "diff", edge: "tab" },
    operation: { beside: null, edge: "right" },
    "revision-tools": { beside: "description", edge: "right" },
    evolution: { beside: "diff", edge: "tab" },
    history: { beside: "timeline", edge: "tab" },
    settings: { beside: "timeline", edge: "tab" },
};

export function isPanelId(value: unknown): value is PanelId {
    return typeof value === "string" && PANEL_IDS.includes(value as PanelId);
}

export function clampRatio(value: number): number {
    return Math.max(0.16, Math.min(0.84, Number.isFinite(value) ? value : 0.5));
}

function tabs(active: PanelId, panels: PanelId[] = [active]): DockNode {
    return { type: "tabs", active, panels };
}

function split(direction: "row" | "column", ratio: number, first: DockNode, second: DockNode): DockNode {
    return { type: "split", direction, ratio: clampRatio(ratio), first, second };
}

export function defaultLayout(): DockNode {
    return split("row", 0.42,
        tabs("timeline"),
        split("column", 0.34,
            tabs("description"),
            split("row", 0.32, tabs("tree"), tabs("diff")),
        ),
    );
}

export function openPanels(node: DockNode | null): PanelId[] {
    if (!node) return [];
    if (node.type === "tabs") return [...node.panels];
    return [...openPanels(node.first), ...openPanels(node.second)];
}

export function contains(node: DockNode | null, id: PanelId): boolean {
    return openPanels(node).includes(id);
}

export function activate(node: DockNode, id: PanelId): DockNode {
    if (node.type === "tabs") return node.panels.includes(id) ? { ...node, active: id } : node;
    return { ...node, first: activate(node.first, id), second: activate(node.second, id) };
}

export function closePanel(node: DockNode | null, id: PanelId): DockNode | null {
    if (!node) return null;
    if (node.type === "tabs") {
        if (!node.panels.includes(id)) return node;
        let panels = node.panels.filter(panel => panel !== id);
        if (!panels.length) return null;
        return { type: "tabs", panels, active: node.active === id ? panels[0] : node.active };
    }
    let first = closePanel(node.first, id);
    let second = closePanel(node.second, id);
    if (!first) return second;
    if (!second) return first;
    if (first === node.first && second === node.second) return node;
    return { ...node, first, second };
}

function place(existing: DockNode, id: PanelId, edge: Edge, before?: PanelId): DockNode {
    if (edge === "tab" && existing.type === "tabs") {
        let panels = [...existing.panels];
        let index = before ? panels.indexOf(before) : panels.length;
        panels.splice(index < 0 ? panels.length : index, 0, id);
        return { ...existing, panels, active: id };
    }
    let incoming = tabs(id);
    let incomingFirst = edge === "left" || edge === "top";
    let horizontal = edge === "left" || edge === "right" || edge === "tab";
    return split(horizontal ? "row" : "column", incomingFirst ? 0.32 : 0.68, incomingFirst ? incoming : existing, incomingFirst ? existing : incoming);
}

function splitAround(node: DockNode, target: PanelId, id: PanelId, edge: Edge, insertBefore = false): { node: DockNode; placed: boolean } {
    if (node.type === "tabs") {
        if (!node.panels.includes(target)) return { node, placed: false };
        return { node: place(node, id, edge, insertBefore ? target : undefined), placed: true };
    }
    let first = splitAround(node.first, target, id, edge, insertBefore);
    if (first.placed) return { node: { ...node, first: first.node }, placed: true };
    let second = splitAround(node.second, target, id, edge, insertBefore);
    if (second.placed) return { node: { ...node, second: second.node }, placed: true };
    return { node, placed: false };
}

export function openPanel(node: DockNode | null, id: PanelId): DockNode {
    if (!node) return tabs(id);
    if (contains(node, id)) return activate(node, id);
    let preferred = slot[id];
    if (preferred.beside && contains(node, preferred.beside)) return splitAround(node, preferred.beside, id, preferred.edge).node;
    let incoming = tabs(id);
    if (preferred.edge === "left" || preferred.edge === "top") return split(preferred.edge === "left" ? "row" : "column", 0.32, incoming, node);
    return split(preferred.edge === "bottom" ? "column" : "row", 0.68, node, incoming);
}

function siblingPanel(node: DockNode, id: PanelId): PanelId | undefined {
    if (node.type === "tabs") return node.panels.includes(id) ? node.panels.find(panel => panel !== id) : undefined;
    return siblingPanel(node.first, id) ?? siblingPanel(node.second, id);
}

export function movePanel(node: DockNode, id: PanelId, target: PanelId, edge: Edge): DockNode {
    if (!contains(node, id) || !contains(node, target)) return node;
    if (id === target && edge === "tab") return node;
    // the dragged active tab also identifies its group; retain a sibling as the split anchor.
    let anchor = id === target ? siblingPanel(node, id) : target;
    if (!anchor) return node;
    let without = closePanel(node, id);
    if (!without || !contains(without, anchor)) return node;
    let placed = splitAround(without, anchor, id, edge === "tab-end" ? "tab" : edge, edge === "tab");
    return placed.placed ? placed.node : node;
}

export function setRatio(node: DockNode, path: number[], ratio: number): DockNode {
    if (node.type !== "split") return node;
    if (!path.length) return { ...node, ratio: clampRatio(ratio) };
    let [head, ...rest] = path;
    return head === 0
        ? { ...node, first: setRatio(node.first, rest, ratio) }
        : { ...node, second: setRatio(node.second, rest, ratio) };
}

function parseNode(value: unknown, seen: Set<PanelId>): DockNode | null {
    if (!value || typeof value !== "object") return null;
    let record = value as Record<string, unknown>;
    if (record.type === "tabs" && Array.isArray(record.panels)) {
        if (!record.panels.length || record.panels.some(id => !isPanelId(id) || seen.has(id))) return null;
        let panels = record.panels as PanelId[];
        if (new Set(panels).size !== panels.length) return null;
        panels.forEach(id => seen.add(id));
        let active = isPanelId(record.active) && panels.includes(record.active) ? record.active : panels[0];
        return { type: "tabs", active, panels };
    }
    if (record.type === "split" && (record.direction === "row" || record.direction === "column") && typeof record.ratio === "number") {
        let first = parseNode(record.first, seen);
        let second = parseNode(record.second, seen);
        if (!first || !second) return null;
        return { type: "split", direction: record.direction, ratio: clampRatio(record.ratio), first, second };
    }
    return null;
}

export function restoreDock(value: unknown): DockState | null {
    if (!value || typeof value !== "object") return null;
    let record = value as Record<string, unknown>;
    if (record.version !== 1) return null;
    if (record.root === null) return { root: null, compactActive: null };
    let seen = new Set<PanelId>();
    let root = parseNode(record.root, seen);
    if (!root) return null;
    let open = openPanels(root);
    let compactActive = isPanelId(record.compactActive) && open.includes(record.compactActive) ? record.compactActive : open[0] ?? null;
    return { root, compactActive };
}

export type DockStore = Writable<DockState> & {
    open: (id: PanelId) => void;
    close: (id: PanelId) => void;
    move: (id: PanelId, target: PanelId, edge: Edge) => void;
    resize: (path: number[], ratio: number) => void;
    focus: (id: PanelId) => void;
    reset: () => void;
};

function defaultState(): DockState {
    return { root: defaultLayout(), compactActive: "timeline" };
}

export function createDock(storage?: Pick<Storage, "getItem" | "setItem"> | null): DockStore {
    let saved: DockState | null = null;
    try { saved = restoreDock(JSON.parse(storage?.getItem(STORAGE_KEY) ?? "null")); } catch { saved = null; }
    let store = writable<DockState>(saved ?? defaultState());
    store.subscribe(state => {
        try { storage?.setItem(STORAGE_KEY, JSON.stringify({ version: 1, ...state })); } catch { /* the layout stays in memory */ }
    });
    return {
        ...store,
        subscribe: store.subscribe,
        open: id => store.update(state => ({ root: openPanel(state.root, id), compactActive: id })),
        close: id => store.update(state => {
            let root = closePanel(state.root, id);
            let open = openPanels(root);
            return { root, compactActive: state.compactActive === id ? open[0] ?? null : (state.compactActive && open.includes(state.compactActive) ? state.compactActive : open[0] ?? null) };
        }),
        move: (id, target, edge) => store.update(state => state.root ? { ...state, root: movePanel(state.root, id, target, edge), compactActive: id } : state),
        resize: (path, ratio) => store.update(state => state.root ? { ...state, root: setRatio(state.root, path, ratio) } : state),
        focus: id => store.update(state => ({ root: state.root && contains(state.root, id) ? activate(state.root, id) : state.root, compactActive: contains(state.root, id) ? id : state.compactActive })),
        reset: () => store.set(defaultState()),
    };
}

export const dock = createDock(typeof localStorage === "undefined" ? null : localStorage);
