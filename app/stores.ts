import { workspaceController } from "./workspace/state";
import type { MutationResult } from "./messages/MutationResult";
import type { ProgressEvent } from "./messages/ProgressEvent";
import type { RepoConfig } from "./messages/RepoConfig";
import type { RepoStatus } from "./messages/RepoStatus";
import type { RevHeader } from "./messages/RevHeader";
import type { RevSet } from "./messages/RevSet";
import type { Operand } from "./messages/Operand";
import { get, writable } from "svelte/store";
import { event, type Query } from "./events";
import type { InputRequest } from "./messages/InputRequest";
import type { InputResponse } from "./messages/InputResponse";
import type { RevChange } from "./messages/RevChange";

export const repoConfigEvent = await event<RepoConfig>("gg://repo/config", { type: "Initial" });
export const repoStatusEvent = await event<RepoStatus | undefined>("gg://repo/status", undefined);
export const revisionSelectEvent = await event<RevSet | undefined>("gg://revision/select", undefined);
export const changeSelectEvent = await event<RevChange | undefined>("gg://change/select", undefined);
export const progressEvent = await event<ProgressEvent | undefined>("gg://progress", undefined);

export const currentMutation = writable<Query<MutationResult> | null>(null);
export const currentContext = writable<Operand | null>();
export const currentSource = writable<Operand | null>();
export const currentTarget = writable<Operand | null>();
export const currentInput = writable<InputRequest & { callback: (response: InputResponse | null) => void; } | null>();

export const hasModal = writable<boolean>(false);
export const hasMenu = writable<{ x: number; y: number; } | null>(null);
export const logQueryRequest = writable<string | null>(null);
export let activeLogQuery = writable<string | null>(null);
export let compactWorkspace = writable(false);
export const lastFocus = writable<number>(Date.now());
export const ignoreToggled = writable<boolean>(false);

export const selectionHeaders = writable<RevHeader[]>([]);
/** revisions picked one by one with Ctrl/⌘; while set, the selection above is only the focused revision */
export const pickedRevisions = writable<RevHeader[]>([]);

export let descriptionDrafts = writable<Record<string, string>>({});
export let revisionReviewState = new Map<string, { path: string; scrollTop: number }>();
export let fileScrollPositions = new Map<string, number>();
export let fileHorizontalPositions = new Map<string, number[]>();

export function workingCopySelection(status: RepoStatus): RevSet {
    let id = {
        change: { type: "ChangeId" as const, hex: "@", prefix: "@", rest: "", offset: null, is_divergent: false },
        commit: status.working_copy,
    };
    return { from: id, to: id };
}

export function selectWorkingCopy() {
    let status = get(repoStatusEvent);
    if (!status) return;
    let set = workingCopySelection(status);
    revisionSelectEvent.set(set);
    workspaceController.selectRevision(set);
}

export function dragOverWidget(event: DragEvent) {
    event.stopPropagation();
    currentTarget.set(null);
}

function preference<T extends string | boolean | number>(key: string, initial: T) {
    let value = initial;
    try { let saved = JSON.parse(localStorage.getItem(key) ?? "null"); if (typeof saved === typeof initial) value = saved; } catch { /* storage can be unavailable in private webviews */ }
    let store = writable<T>(value);
    store.subscribe(value => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* preferences remain usable in memory */ } });
    return store;
}
export let fileTreeWidth = preference<number>("gg.layout.files-width", 200);
export let diffStyle = preference<"auto" | "split" | "unified">("gg.diff-style", "auto");
export let diffFullContext = preference<boolean>("gg.diff-full-context", false);
export let diffWrap = preference<boolean>("gg.diff-wrap", false);


export let navigationExpanded = preference<boolean>("gg.navigation.expanded", false);
