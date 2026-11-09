import { mount, unmount } from "svelte";
import NoteMarker from "./NoteMarker.svelte";
import type { DiffNote } from "./diffNotes";

interface MountedMarker { slot: HTMLSlotElement; wrapper: HTMLElement; component: ReturnType<typeof mount>; signature: string; }
function findRow(root: ShadowRoot, entry: DiffNote) {
    let type = entry.side === "deletions" ? "change-deletion" : "change-addition";
    let rows = [...root.querySelectorAll<HTMLElement>(`[data-column-number="${entry.line}"]${entry.contextLine === undefined ? "" : `, [data-column-number="${entry.contextLine}"]`}`)];
    return rows.find(row => {
        let column = row.closest("[data-deletions], [data-additions]");
        if (column?.hasAttribute(entry.side === "deletions" ? "data-deletions" : "data-additions")) return Number(row.dataset.columnNumber) === entry.line;
        let rowType = row.getAttribute("data-line-type");
        return rowType === type && Number(row.dataset.columnNumber) === entry.line || rowType === "context" && Number(row.dataset.columnNumber) === (entry.side === "additions" ? entry.line : entry.contextLine);
    });
}
export function createDiffNoteMarkers() {
    let mounted = new Map<string, MountedMarker>();
    function remove(key: string) {
        let marker = mounted.get(key);
        if (!marker) return;
        void unmount(marker.component); marker.slot.remove(); marker.wrapper.remove(); mounted.delete(key);
    }
    return {
        update(container: HTMLElement, notes: readonly DiffNote[]) {
            let root = container.shadowRoot;
            if (!root) return;
            container.toggleAttribute("data-has-note-markers", notes.length > 0);
            let rows = new Map<HTMLElement, DiffNote[]>();
            for (let entry of notes) { let row = findRow(root, entry); if (row) rows.set(row, [...(rows.get(row) ?? []), entry]); }
            let retained = new Set<string>();
            for (let [row, entries] of rows) {
                let key = entries.map(entry => `${entry.side}-${entry.line}`).sort().join("-");
                let notes = [...new Map(entries.flatMap(entry => entry.notes).map(note => [note.id, note])).values()];
                let signature = notes.map(note => `${note.id}:${note.updated_at}`).join("|");
                retained.add(key);
                let marker = mounted.get(key);
                if (marker && marker.signature !== signature) { remove(key); marker = undefined; }
                if (!marker) {
                    let slot = document.createElement("slot"), wrapper = document.createElement("span");
                    slot.name = `gg-note-${key}`; slot.setAttribute("data-note-marker", ""); wrapper.slot = slot.name; wrapper.className = "diff-note-marker";
                    container.append(wrapper);
                    let positions = entries.map(entry => `${entry.side === "deletions" ? "old" : "new"} line ${entry.line}`).join(" and ");
                    let component = mount(NoteMarker, { target: wrapper, props: { notes, buttonLabel: `Open ${notes.length} ${notes.length === 1 ? "note" : "notes"} on ${positions}` } });
                    marker = { slot, wrapper, component, signature }; mounted.set(key, marker);
                }
                if (marker.wrapper.parentElement !== container) container.append(marker.wrapper);
                if (marker.slot.parentElement !== row) row.append(marker.slot);
            }
            for (let key of mounted.keys()) if (!retained.has(key)) remove(key);
        },
        destroy() { for (let key of mounted.keys()) remove(key); },
    };
}
