import { get, writable } from "svelte/store";
import type { RevSet } from "../messages/RevSet";
import { workspaceViews } from "./views";

export type Presentation = "closed" | "collapsed" | "half" | "full";
export type ReturnPresentation = "collapsed" | "half";
export type Inspector = { revset: string; fromRevset: string | null; selection: RevSet | null; activeFilePath: string | null; fileFromRoute?: boolean };
export type WorkspaceState = {
    repository: string | null;
    inspector: Inspector | null;
    presentation: Presentation;
    returnPresentation: ReturnPresentation;
    graphFraction: number;
    toolTabs: string[];
    activeTool: string | null;
    routedTool: string | null;
};

export function clampGraphFraction(value: number): number {
    return Number.isFinite(value) ? Math.max(0.1, Math.min(0.8, value)) : 0.25;
}

export function selectRevision(state: WorkspaceState, selection: RevSet, availablePaths?: string[]): WorkspaceState {
    let path = state.inspector?.activeFilePath ?? null;
    if (path && availablePaths && !availablePaths.includes(path)) path = null;
    return { ...state, inspector: { revset: selection.to.commit.hex || selection.to.change.hex, fromRevset: (selection.from.commit.hex || selection.from.change.hex) !== (selection.to.commit.hex || selection.to.change.hex) ? (selection.from.commit.hex || selection.from.change.hex) : null, selection, activeFilePath: path }, presentation: "half", returnPresentation: "half" };
}

export function present(state: WorkspaceState, presentation: Presentation): WorkspaceState {
    if (presentation === "closed") return { ...state, inspector: null, presentation };
    if (!state.inspector) return state;
    if (presentation === "full") return { ...state, presentation, returnPresentation: state.presentation === "collapsed" ? "collapsed" : "half" };
    return { ...state, presentation, returnPresentation: presentation };
}

function inspectionFromLocation(location: Location): Inspector | null {
    if (location.pathname !== "/") return null;
    let params = new URLSearchParams(location.search);
    let revset = params.get("inspect");
    return revset ? { revset, fromRevset: params.get("inspectFrom"), selection: null, activeFilePath: params.get("file"), fileFromRoute: params.has("file") } : null;
}

function urlForInspector(location: Location, inspector: Inspector | null): string {
    let url = new URL(location.href);
    if (inspector) {
        url.searchParams.set("inspect", inspector.revset);
        if (inspector.fromRevset) url.searchParams.set("inspectFrom", inspector.fromRevset);
        else url.searchParams.delete("inspectFrom");
        if (inspector.activeFilePath) url.searchParams.set("file", inspector.activeFilePath);
        else url.searchParams.delete("file");
    } else {
        url.searchParams.delete("inspect");
        url.searchParams.delete("inspectFrom");
        url.searchParams.delete("file");
    }
    return url.pathname + url.search + url.hash;
}

function storedFraction(): number {
    try { return clampGraphFraction(Number(localStorage.getItem("gg.layout.graphFraction") ?? 0.25)); }
    catch { return 0.25; }
}

export function validTool(id: string, compact = false): boolean {
    return workspaceViews.some(view => view.id === id && view.placement === "picker" && !!view.component && (compact ? view.mobile === "full" : view.desktop === "tab"));
}

export function readToolLayout(raw: string | null): { tabs: string[]; active: string | null } {
    try {
        let value = JSON.parse(raw ?? "null");
        if (value?.version !== 1 || !Array.isArray(value.tabs)) return { tabs: [], active: null };
        let tabs = [...new Set<string>(value.tabs.filter((id: unknown): id is string => typeof id === "string" && validTool(id)))].slice(0, 3);
        return { tabs, active: value.active === null ? null : tabs.includes(value.active) ? value.active : tabs.at(-1) ?? null };
    } catch { return { tabs: [], active: null }; }
}
function storedTools() {
    try { return readToolLayout(localStorage.getItem("gg.workspace.layout")); }
    catch { return { tabs: [], active: null }; }
}
function writeTools(tabs: string[], active: string | null) {
    try { localStorage.setItem("gg.workspace.layout", JSON.stringify({ version: 1, tabs, active })); } catch { /* layout remains usable in memory */ }
}
function toolUrl(id: string | null): string {
    let url = new URL(window.location.href);
    if (id) url.searchParams.set("view", id); else url.searchParams.delete("view");
    return url.pathname + url.search + url.hash;
}

export function createWorkspaceController() {
    let layout = storedTools();
    let store = writable<WorkspaceState>({ repository: null, inspector: null, presentation: "closed", returnPresentation: "half", graphFraction: storedFraction(), toolTabs: layout.tabs, activeTool: layout.active, routedTool: null });
    let fileBySelection = new Map<string, string>();
    let selectionKey = (selection: RevSet) => `${selection.from.commit.hex}:${selection.to.commit.hex}`;
    function rememberFile(state: WorkspaceState) {
        if (state.inspector?.selection && state.inspector.activeFilePath) {
            fileBySelection.set(selectionKey(state.inspector.selection), state.inspector.activeFilePath);
            if (fileBySelection.size > 100) fileBySelection.delete(fileBySelection.keys().next().value!);
        }
    }
    let ownsHistoryEntry = false;
    let started = false;
    function syncLocation() {
        let inspector = inspectionFromLocation(window.location);
        let requestedTool = new URLSearchParams(window.location.search).get("view");
        let routedTool = requestedTool && validTool(requestedTool, true) ? requestedTool : null;
        let previousRoute = get(store).routedTool;
        store.update(state => {
            let activeTool = state.routedTool && !routedTool && state.activeTool === state.routedTool ? null : state.activeTool;
            if (inspector) {
                let same = state.inspector?.revset === inspector.revset && state.inspector?.fromRevset === inspector.fromRevset;
                return { ...state, activeTool, routedTool, inspector: { ...inspector, selection: same ? state.inspector!.selection : null }, presentation: "full" };
            }
            if (state.presentation === "full") return { ...state, activeTool, routedTool, presentation: state.returnPresentation };
            return { ...state, activeTool, routedTool };
        });
        if (previousRoute && !routedTool) writeTools(get(store).toolTabs, get(store).activeTool);
        ownsHistoryEntry = !!inspector && !!history.state?.ggInspector;
    }
    function start() {
        if (started || typeof window === "undefined") return () => {};
        started = true;
        syncLocation();
        window.addEventListener("popstate", syncLocation);
        return () => { window.removeEventListener("popstate", syncLocation); started = false; };
    }
    function setPresentation(presentation: Presentation) {
        let state = get(store);
        if (presentation === "full" && state.inspector && state.presentation !== "full") {
            store.set(present(state, presentation));
            if (typeof window !== "undefined") {
                history.pushState({ ...history.state, ggInspector: true }, "", urlForInspector(window.location, state.inspector));
                ownsHistoryEntry = true;
            }
        } else if (state.presentation === "full" && presentation !== "full" && typeof window !== "undefined") {
            store.set(present(state, presentation));
            if (ownsHistoryEntry) { ownsHistoryEntry = false; history.back(); }
            else history.replaceState(history.state, "", urlForInspector(window.location, null));
        } else store.set(present(state, presentation));
    }
    return {
        subscribe: store.subscribe,
        start,
        openView(id: string, compact: boolean) {
            if (!validTool(id, compact)) return;
            if (compact && typeof window !== "undefined") {
                let current = get(store).routedTool;
                if (current) history.replaceState({ ...history.state, ggTool: true }, "", toolUrl(id));
                else history.pushState({ ...history.state, ggTool: true }, "", toolUrl(id));
                store.update(state => ({ ...state, routedTool: id }));
            } else {
                let routed = !!get(store).routedTool && validTool(id, true) && typeof window !== "undefined";
                if (routed) history.replaceState({ ...history.state, ggTool: true }, "", toolUrl(id));
                store.update(state => {
                    let tabs = state.toolTabs.includes(id) ? state.toolTabs : [...state.toolTabs, id].slice(-3);
                    writeTools(tabs, id);
                    return { ...state, toolTabs: tabs, activeTool: id, routedTool: routed ? id : state.routedTool };
                });
            }
        },
        closeView(compact: boolean) {
            if (compact && typeof window !== "undefined" && get(store).routedTool) {
                store.update(state => ({ ...state, activeTool: state.activeTool === state.routedTool ? null : state.activeTool, routedTool: null }));
                writeTools(get(store).toolTabs, get(store).activeTool);
                if (history.state?.ggTool) history.back(); else history.replaceState(history.state, "", toolUrl(null));
            } else store.update(state => { writeTools(state.toolTabs, null); return { ...state, activeTool: null }; });
        },
        adaptViewport(compact: boolean) {
            let state = get(store);
            if (compact && !state.routedTool && state.activeTool && validTool(state.activeTool, true) && typeof window !== "undefined") {
                history.pushState({ ...history.state, ggTool: true }, "", toolUrl(state.activeTool));
                store.update(current => ({ ...current, routedTool: current.activeTool }));
            } else if (!compact && state.routedTool && validTool(state.routedTool)) {
                let id = state.routedTool;
                store.update(current => {
                    let tabs = current.toolTabs.includes(id) ? current.toolTabs : [...current.toolTabs, id].slice(-3);
                    writeTools(tabs, id);
                    return { ...current, toolTabs: tabs, activeTool: id };
                });
            }
        },
        closeTab(id: string) {
            store.update(state => {
                let tabs = state.toolTabs.filter(tab => tab !== id);
                let active = state.activeTool === id ? tabs.at(-1) ?? null : state.activeTool;
                writeTools(tabs, active);
                return { ...state, toolTabs: tabs, activeTool: active };
            });
        },
        resetLayout() {
            if (get(store).routedTool && typeof window !== "undefined") {
                store.update(state => ({ ...state, activeTool: null, routedTool: null }));
                if (history.state?.ggTool) history.back(); else history.replaceState(history.state, "", toolUrl(null));
            }
            writeTools([], null);
            try {
                for (let view of workspaceViews) if (view.validateState) localStorage.removeItem(`gg.workspace.view.${view.id}`);
            } catch { /* storage is optional */ }
            store.update(state => ({ ...state, toolTabs: [], activeTool: null }));
        },
        setRepository(repository: string) {
            let previous = get(store).repository;
            if (previous !== repository) fileBySelection.clear();
            store.update(state => state.repository === repository ? state : state.repository === null ? { ...state, repository } : { ...state, repository, inspector: null, presentation: "closed", returnPresentation: "half", activeTool: null, routedTool: null });
            if (previous !== null && previous !== repository && typeof window !== "undefined") {
                history.replaceState(null, "", toolUrl(null));
                history.replaceState(null, "", urlForInspector(window.location, null));
                writeTools(get(store).toolTabs, null);
                ownsHistoryEntry = false;
            }
        },
        selectRevision(selection: RevSet, availablePaths?: string[]) {
            rememberFile(get(store));
            let wasFull = get(store).presentation === "full";
            store.update(state => selectRevision(state, selection, availablePaths));
            if (wasFull && typeof window !== "undefined") {
                if (ownsHistoryEntry) { ownsHistoryEntry = false; history.back(); }
                else history.replaceState(history.state, "", urlForInspector(window.location, null));
            }
        },
        reconcileSelection(selection: RevSet, availablePaths?: string[]) {
            store.update(state => {
                if (!state.inspector) return state;
                rememberFile(state);
                let previousSelection = state.inspector.selection;
                let changed = previousSelection && selectionKey(previousSelection) !== selectionKey(selection);
                let path = changed && !state.inspector.fileFromRoute ? fileBySelection.get(selectionKey(selection)) ?? state.inspector.activeFilePath : state.inspector.activeFilePath;
                if (path && availablePaths && !availablePaths.includes(path) && !state.inspector.fileFromRoute) path = null;
                return { ...state, inspector: { revset: selection.to.commit.hex || selection.to.change.hex, fromRevset: (selection.from.commit.hex || selection.from.change.hex) !== (selection.to.commit.hex || selection.to.change.hex) ? (selection.from.commit.hex || selection.from.change.hex) : null, selection, activeFilePath: path, fileFromRoute: state.inspector.fileFromRoute } };
            });
            let state = get(store);
            if (state.presentation === "full" && state.inspector && typeof window !== "undefined") history.replaceState(history.state, "", urlForInspector(window.location, state.inspector));
        },
        setFile(path: string | null) {
            rememberFile(get(store));
            store.update(state => state.inspector ? { ...state, inspector: { ...state.inspector, activeFilePath: path, fileFromRoute: false } } : state);
            let state = get(store);
            if (state.presentation === "full" && state.inspector && typeof window !== "undefined") history.replaceState(history.state, "", urlForInspector(window.location, state.inspector));
        },
        setPresentation,
        back() { let state = get(store); setPresentation(state.presentation === "full" ? state.returnPresentation : "closed"); },
        setGraphFraction(value: number) {
            let fraction = clampGraphFraction(value);
            store.update(state => ({ ...state, graphFraction: fraction }));
            try { localStorage.setItem("gg.layout.graphFraction", JSON.stringify(fraction)); } catch { /* retain the in-memory preference */ }
        },
    };
}

export let workspaceController = createWorkspaceController();
