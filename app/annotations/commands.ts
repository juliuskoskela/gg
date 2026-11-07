import type { Command } from "../commands/registry";
import type { Operand } from "../messages/Operand";
import type { TargetInput } from "../messages/TargetInput";
import { targetsFor } from "./anchors";
import { addDestination, startDraft } from "./store";

function annotateLabel(targets: TargetInput[]) {
    if (targets.length > 1) {
        let kind = targets.every(target => target.anchor.kind === "revision") ? "changes" : targets.every(target => target.anchor.kind === "file") ? "files" : "places";
        return `Annotate ${targets.length} ${kind}…`;
    }
    return { revision: "Annotate change…", bookmark: "Annotate bookmark…", file: "Annotate file…", lines: "Annotate these lines…" }[targets[0].anchor.kind];
}

/**
 * Annotate starts a note; Add to points the note being worked on here too.
 * Annotating never touches the repository, so both are offered even for immutable revisions.
 */
export function targetCommands(resolve: () => TargetInput[] | Promise<TargetInput[]>, label: string, reason: string | null = null): Command[] {
    let destination = addDestination();
    let commands: Command[] = [{ id: "annotate", label, icon: "message-square", scope: "Annotation", group: 9, reason, execute: async () => { startDraft(await resolve()); } }];
    if (destination) commands.push({ id: "annotate-add", label: destination.label, icon: "plus-square", scope: "Annotation", group: 9, reason, execute: async () => { await destination.add(await resolve()); } });
    return commands;
}

export function annotationCommands(operand: Operand | null | undefined): Command[] {
    let targets = targetsFor(operand);
    return targets.length ? targetCommands(() => targets, annotateLabel(targets)) : [];
}
