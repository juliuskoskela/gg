import type { Text } from "@codemirror/state";
import { MAX_LINES, subjectOf } from "../annotations/anchors";
import { targetCommands } from "../annotations/commands";
import { copyText } from "../annotations/store";
import { editCommands, type TextTarget } from "../commands/textCommands";
import type { Command } from "../commands/registry";
import type { AnnotationAnchor } from "../messages/AnnotationAnchor";
import type { ColumnRange } from "../messages/ColumnRange";
import type { RevHeader } from "../messages/RevHeader";
import type { TargetInput } from "../messages/TargetInput";

/** after the annotation (9) and edit (10) groups */
export let FILE_GROUP = 11;
export let UNSAVED = "Save the file before annotating it";

export interface LineSpan {
    /** 1-based, inclusive */
    start: number;
    end: number;
    /** UTF-16 offsets from the start of the first and last line; the end is exclusive */
    from: number;
    to: number;
    /** nothing selected, so the span is the clicked line */
    empty: boolean;
    /** the selection starts at a line start and ends at a line end */
    whole: boolean;
}

/** the lines a selection spans; one that ends at the start of a line doesn't include that line, as in native editors */
export function lineSpan(doc: Text, from: number, to: number): LineSpan {
    let first = doc.lineAt(from);
    let last = doc.lineAt(to);
    let end = to - last.from;
    if (to > from && to === last.from) { last = doc.lineAt(to - 1); end = last.length; }
    let start = from - first.from;
    let empty = from === to || (first.number === last.number && start === end);
    return { start: first.number, end: last.number, from: start, to: end, empty, whole: !empty && start === 0 && end === last.length };
}

/** columns count Unicode scalar values, not UTF-16 units, so an emoji before the selection counts once */
export function scalarOffset(line: string, offset: number): number {
    return Array.from(line.slice(0, offset)).length;
}

export function selectionColumns(doc: Text, span: LineSpan): ColumnRange {
    return { start: scalarOffset(doc.line(span.start).text, span.from), end: scalarOffset(doc.line(span.end).text, span.to) };
}

/** a lines anchor on the working copy's new side, quoting the whole lines; selections add their columns */
export function editorAnchor(header: RevHeader, path: string, doc: Text, span: LineSpan, columns: boolean): AnnotationAnchor {
    let quote = doc.sliceString(doc.line(span.start).from, doc.line(span.end).to, "\n");
    let anchor: AnnotationAnchor = { kind: "lines", change_id: header.id.change.hex, commit_id: header.id.commit.hex, path, side: "new", start: span.start, end: span.end, quote };
    if (columns) anchor.columns = selectionColumns(doc, span);
    return anchor;
}

export interface EditorMenuInput {
    doc: Text;
    from: number;
    to: number;
    target: TextTarget;
    path: string;
    /** the working copy's header; without one nothing can be annotated */
    header?: RevHeader;
    dirty: boolean;
    paste: string | null;
    /** the file's change in the working copy, when it has one */
    onOpenDiff?: () => void;
}

export function editorCommands(input: EditorMenuInput): Command[] {
    let { doc, header, path } = input;
    let commands: Command[] = [];
    if (header) {
        let span = lineSpan(doc, input.from, input.to);
        let count = span.end - span.start + 1;
        let reason = input.dirty ? UNSAVED : count > MAX_LINES ? `Annotate at most ${MAX_LINES} lines` : null;
        let subject = subjectOf(header);
        let anchored = (columns: boolean): TargetInput[] => [{ anchor: editorAnchor(header, path, doc, span, columns), subject }];
        // the anchor is built when the menu opens, so what is quoted is what was under the pointer
        let lines = anchored(false);
        commands.push(...targetCommands(() => lines, count === 1 ? "Annotate line…" : "Annotate lines…", reason));
        if (!span.empty && !span.whole) {
            let selection = anchored(true);
            // the same command twice needs distinct ids, since the menu keys its items by them
            commands.push(...targetCommands(() => selection, "Annotate selection…", reason).map(command => ({ ...command, id: `${command.id}-selection`, label: command.id === "annotate" ? command.label : `${command.label} (selection)` })));
        }
    }
    commands.push(...editCommands(input.target, input.paste));
    if (input.onOpenDiff) commands.push({ id: "file.open-diff", label: "Open diff", icon: "columns", scope: "File", group: FILE_GROUP, reason: null, execute: input.onOpenDiff });
    commands.push(copyPathCommand(path));
    return commands;
}

export function copyPathCommand(path: string): Command {
    return { id: "file.copy-path", label: "Copy path", icon: "link", scope: "File", group: FILE_GROUP, reason: null, execute: async () => { await copyText(path); } };
}

/** what the editor reports when its menu opens: where, and the selection as it is after the cursor moved */
export interface EditorMenu { x: number; y: number; doc: Text; from: number; to: number; target: TextTarget }
