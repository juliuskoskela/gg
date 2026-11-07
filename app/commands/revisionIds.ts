import type { RevHeader } from "../messages/RevHeader";
import type { Command } from "./registry";
import { copyText } from "../annotations/store";

export function revisionIdCommands(headers: RevHeader[]): Command[] {
    let header = headers.length === 1 ? headers[0] : null;
    return (["change", "commit"] as const).map(kind => ({
        id: `copy_${kind}_id`, label: `Copy ${kind} ID`, icon: "clipboard", scope: "Revision", group: 0,
        reason: header ? null : "Select one revision",
        execute: async () => { if (header) await copyText(header.id[kind].hex); },
    }));
}
