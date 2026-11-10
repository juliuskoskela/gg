import type { Tone } from "../controls/LogList.svelte";

export type OperationKind = { icon: string; tone: Tone; label: string };

let neutral: OperationKind = { icon: "circle", tone: "neutral", label: "Operation" };

// order matters: multi-word and compound verbs come before the single words they start with
let rules: [RegExp, OperationKind][] = [
    [/^snapshot\b/, { icon: "camera", tone: "neutral", label: "Snapshot" }],
    [/^(undo|redo)\b/, { icon: "rotate-ccw", tone: "undo", label: "Undo" }],
    [/^(restore to operation|revert operation)\b/, { icon: "rotate-ccw", tone: "undo", label: "Undo" }],
    [/^(untrack|abandon|forget|delete|remove)\b/, { icon: "trash-2", tone: "remove", label: "Removed" }],
    [/^(fetch|pull)\b/, { icon: "download-cloud", tone: "remote", label: "Remote" }],
    [/^(push|export)\b/, { icon: "upload-cloud", tone: "remote", label: "Remote" }],
    [/^(import\b|track\b)/, { icon: "download-cloud", tone: "remote", label: "Remote" }],
    [/^(add workspace|rename workspace|update working copy|check out)\b/, { icon: "at-sign", tone: "workspace", label: "Workspace" }],
    [/^(new|commit|duplicate|split|create)\b/, { icon: "plus-circle", tone: "create", label: "Created" }],
    [/^(describe|squash|rebase|edit|restore|absorb|resolve|parallelize|set|move)\b/, { icon: "edit-3", tone: "rewrite", label: "Rewritten" }],
];

/** classifies an operation by the leading words jj writes in its description */
export function operationKind(description: string): OperationKind {
    let text = description.trim().toLowerCase();
    for (let [pattern, kind] of rules) if (pattern.test(text)) return kind;
    return neutral;
}
