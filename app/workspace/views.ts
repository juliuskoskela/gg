import type { ComponentType, SvelteComponent } from "svelte";
import type { RepoStatus } from "../messages/RepoStatus";
import OperationView from "./OperationView.svelte";

export type ViewContext = { status?: RepoStatus; hasSelection?: boolean; viewState?: unknown; onViewStateChange?: (value: unknown) => void };
export type WorkspaceView = {
    id: string;
    label: string;
    commandLabel?: string;
    destination?: "history" | "inspect";
    scope: "repository" | "revision";
    placement: "graph" | "inspector" | "picker";
    mobile: "graph" | "sheet" | "full";
    desktop?: "tab";
    available?: (context: ViewContext) => boolean;
    initialState?: unknown;
    validateState?: (value: unknown) => boolean;
    component?: ComponentType<SvelteComponent<ViewContext>>;
};

// Registration makes a view discoverable; it does not add a permanent navigation item.
export let workspaceViews: WorkspaceView[] = [
    { id: "history", label: "History", commandLabel: "Return to graph", destination: "history", scope: "repository", placement: "graph", mobile: "graph" },
    { id: "changes", label: "Changes", commandLabel: "Inspect full revision", destination: "inspect", available: context => !!context.hasSelection, scope: "revision", placement: "inspector", mobile: "sheet" },
    { id: "operation", label: "Current operation", scope: "repository", placement: "picker", desktop: "tab", mobile: "full", available: context => !!context.status, component: OperationView },
];

// Views opt in to persisted presentation state with a validator; repository data is not stored here.
export function restoreViewState(view: WorkspaceView): unknown {
    if (!view.validateState) return view.initialState;
    try {
        let raw = localStorage.getItem(`gg.workspace.view.${view.id}`);
        if (raw && raw.length <= 4096) {
            let value: unknown = JSON.parse(raw);
            if (view.validateState(value)) return value;
        }
    } catch { /* unavailable storage or malformed state */ }
    return view.initialState;
}
export function saveViewState(view: WorkspaceView, value: unknown): void {
    if (!view.validateState?.(value)) return;
    try {
        let raw = JSON.stringify(value);
        if (raw && raw.length <= 4096) localStorage.setItem(`gg.workspace.view.${view.id}`, raw);
    } catch { /* state stays usable in memory */ }
}
