import { RangeSet, StateEffect, StateField, type Text } from "@codemirror/state";
import { GutterMarker, gutter } from "@codemirror/view";

import type { GutterMark, MarkKind } from "./gutterMarks";
export { gutterMarks } from "./gutterMarks";
export type { GutterMark, MarkKind };

class ChangeMarker extends GutterMarker {
    constructor(readonly kind: MarkKind) { super(); }
    eq(other: GutterMarker) { return other instanceof ChangeMarker && other.kind === this.kind; }
    toDOM() {
        let element = document.createElement("span");
        element.className = `cm-change cm-change-${this.kind}`;
        element.setAttribute("data-change", this.kind);
        return element;
    }
}
let markers: Record<MarkKind, ChangeMarker> = { added: new ChangeMarker("added"), modified: new ChangeMarker("modified"), deleted: new ChangeMarker("deleted") };

/** replaces every marker, for when the loaded version of the file changes */
export let setMarks = StateEffect.define<GutterMark[]>();

export function buildMarkers(doc: Text, marks: GutterMark[]): RangeSet<GutterMarker> {
    let ranges = marks
        .map(mark => ({ from: doc.line(Math.min(Math.max(1, mark.line), doc.lines)).from, kind: mark.kind }))
        .sort((a, b) => a.from - b.from)
        .map(({ from, kind }) => markers[kind].range(from));
    return RangeSet.of(ranges, true);
}

export let markerField = StateField.define<RangeSet<GutterMarker>>({
    create: () => RangeSet.empty,
    update(value, transaction) {
        for (let effect of transaction.effects) if (effect.is(setMarks)) return buildMarkers(transaction.newDoc, effect.value);
        return transaction.docChanged ? value.map(transaction.changes) : value;
    },
});

/** a gutter left of the line numbers; markers follow the text through edits */
export function changeGutter(initial: GutterMark[]) {
    return [markerField.init(state => buildMarkers(state.doc, initial)), gutter({ class: "cm-change-gutter", markers: view => view.state.field(markerField) })];
}

/** which lines carry which marker, for tests and accessibility */
export function markedLines(markersSet: RangeSet<GutterMarker>, doc: Text): GutterMark[] {
    let found: GutterMark[] = [];
    for (let cursor = markersSet.iter(); cursor.value; cursor.next()) found.push({ line: doc.lineAt(cursor.from).number, kind: (cursor.value as ChangeMarker).kind });
    return found;
}
