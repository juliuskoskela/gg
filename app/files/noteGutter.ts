import { RangeSet, StateEffect, StateField, type Text } from "@codemirror/state";
import { GutterMarker, ViewPlugin, gutter, type EditorView } from "@codemirror/view";
import { mount, unmount } from "svelte";
import { effectiveAnchor } from "../annotations/anchors";
import NoteMarker from "../annotations/NoteMarker.svelte";
import type { AnnotationThread } from "../messages/AnnotationThread";
import type { RevHeader } from "../messages/RevHeader";

/** open notes on one line of the working copy's file */
export interface LineNotes { line: number; notes: AnnotationThread[] }

/** open notes anchored to lines of this path in the working copy's change; the commit may differ after a snapshot */
export function lineNotes(path: string, header: RevHeader | undefined, threads: readonly AnnotationThread[]): LineNotes[] {
    if (!header) return [];
    let found = new Map<number, AnnotationThread[]>();
    for (let thread of threads) {
        if (thread.status !== "open") continue;
        for (let target of thread.targets) {
            let anchor = effectiveAnchor(target);
            if (anchor.kind !== "lines" || anchor.side !== "new" || anchor.path !== path || anchor.change_id !== header.id.change.hex) continue;
            if (target.state.type === "missing" || target.state.type === "unknown") continue;
            let group = found.get(anchor.start) ?? [];
            if (!group.some(existing => existing.id === thread.id)) found.set(anchor.start, [...group, thread]);
        }
    }
    return [...found.entries()].sort(([a], [b]) => a - b).map(([line, notes]) => ({ line, notes }));
}

let components = new WeakMap<HTMLElement, ReturnType<typeof mount>>();

class NoteLineMarker extends GutterMarker {
    constructor(readonly line: number, readonly notes: AnnotationThread[]) { super(); }
    eq(other: GutterMarker) {
        return other instanceof NoteLineMarker && other.line === this.line && other.notes.length === this.notes.length && other.notes.every((note, i) => note.id === this.notes[i].id && note.updated_at === this.notes[i].updated_at);
    }
    toDOM() {
        let element = document.createElement("span");
        element.className = "cm-note-marker";
        let count = this.notes.length;
        components.set(element, mount(NoteMarker, { target: element, props: { notes: this.notes, buttonLabel: `Open ${count} ${count === 1 ? "note" : "notes"} on line ${this.line}` } }));
        return element;
    }
    destroy(dom: Node) {
        let component = components.get(dom as HTMLElement);
        if (component) void unmount(component);
        components.delete(dom as HTMLElement);
    }
}

/** replaces every marker, for when the notes change */
export let setNotes = StateEffect.define<LineNotes[]>();

function build(doc: Text, notes: LineNotes[]): RangeSet<GutterMarker> {
    let ranges = notes
        .filter(entry => entry.line >= 1 && entry.line <= doc.lines)
        .sort((a, b) => a.line - b.line)
        .map(entry => new NoteLineMarker(entry.line, entry.notes).range(doc.line(entry.line).from));
    return RangeSet.of(ranges, true);
}

let noteField = StateField.define<RangeSet<GutterMarker>>({
    create: () => RangeSet.empty,
    update(value, transaction) {
        for (let effect of transaction.effects) if (effect.is(setNotes)) return build(transaction.newDoc, effect.value);
        return transaction.docChanged ? value.map(transaction.changes) : value;
    },
});

// the gutters are hidden from assistive technology as a whole, which would hide the marker buttons too;
// the other gutters are decoration, so each of them is hidden on its own instead
let reachable = ViewPlugin.fromClass(class {
    constructor(view: EditorView) { this.fix(view); }
    update(update: { view: EditorView }) { this.fix(update.view); }
    fix(view: EditorView) {
        view.requestMeasure({ read: () => null, write: () => {
            let gutters = view.dom.querySelector(".cm-gutters");
            if (!gutters?.querySelector(".cm-note-gutter")) return;
            gutters.removeAttribute("aria-hidden");
            for (let other of gutters.querySelectorAll(".cm-gutter:not(.cm-note-gutter)")) other.setAttribute("aria-hidden", "true");
        } });
    }
});

/** a gutter beside the change gutter; it takes no room while there are no notes */
export function noteGutter(initial: LineNotes[]) {
    return [noteField.init(state => build(state.doc, initial)), gutter({ class: "cm-note-gutter", markers: view => view.state.field(noteField) }), reachable];
}
