import { writable } from "svelte/store";
import type { Operand } from "../messages/Operand";
import { currentSource, currentTarget } from "../stores";

export let pendingDropSource = writable<Operand | null>(null);
export let pendingDropTarget = writable<Operand | null>(null);

export function clearDrag() {
    currentSource.set(null);
    currentTarget.set(null);
}

export function clearPendingDrop() {
    pendingDropSource.set(null);
    pendingDropTarget.set(null);
}

let watchers = 0;
function escape(event: KeyboardEvent) {
    if (event.key === "Escape") clearDrag();
}

export function watchDragCancellation() {
    if (watchers++ === 0) {
        window.addEventListener("blur", clearDrag);
        window.addEventListener("dragend", clearDrag);
        window.addEventListener("keydown", escape);
    }
    return () => {
        if (--watchers === 0) {
            window.removeEventListener("blur", clearDrag);
            window.removeEventListener("dragend", clearDrag);
            window.removeEventListener("keydown", escape);
            clearDrag();
        }
    };
}
