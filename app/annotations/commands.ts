import type { Command } from "../commands/registry";
import type { Operand } from "../messages/Operand";
import { anchorFor } from "./anchors";
import { openComposer } from "./store";

const labels = { revision: "Annotate change…", bookmark: "Annotate bookmark…", file: "Annotate file…", lines: "Annotate these lines…" };

/** annotating never touches the repository, so it is offered even for immutable revisions */
export function annotationCommands(operand: Operand | null | undefined): Command[] {
    let draft = anchorFor(operand);
    if (!draft) return [];
    return [{
        id: "annotate", label: labels[draft.anchor.kind], icon: "message-square", scope: "Annotation", group: 9, reason: null,
        execute: () => openComposer(draft),
    }];
}
