import type { Component } from "svelte";
import { writable } from "svelte/store";
import type { RevsResult } from "../messages/RevsResult";
import type { RevChange } from "../messages/RevChange";
import RevisionChanges from "./RevisionChanges.svelte";

export type RevisionContext = { focused?: boolean; selectedPath?: string; onSelectFile?: (change: RevChange) => void; onRequestFiles?: (() => void) | null; revs: Extract<RevsResult, { type: "Detail" }>; changes: RevChange[] };
export type RevisionModule = {
    id: string;
    label: string;
    component: Component<RevisionContext>;
    available?: (context: RevisionContext) => boolean;
};

// modules share revision context; repository navigation stays owned by the shell.
export let revisionModules = writable<RevisionModule[]>([
    { id: "changes", label: "Changes", component: RevisionChanges },
]);
