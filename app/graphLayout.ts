import { derived, readable, writable } from "svelte/store";

export type HistoryDensity = "compact" | "tall";
export let historyDensityKey = "gg.history-density";
export let revisionRowHeight = 28;
// shared with edge endpoints so smaller markers stay connected.
export let revisionNodeRadius = 4.5;
// the sparse view follows the type system: a body line (20), a 2px gap and a label line (18)
export let revisionTitleHeight = 20;
export let revisionAuthorHeight = 18;
export let revisionRowGap = 2;
export let revisionTallRowHeight = 48;

export function createHistoryDensity(storage?: Pick<Storage, "getItem" | "setItem">) {
    let initial: HistoryDensity = "compact";
    try { if (storage?.getItem(historyDensityKey) === "tall") initial = "tall"; } catch { /* storage can be unavailable in private windows */ }
    let store = writable<HistoryDensity>(initial);
    return {
        subscribe: store.subscribe,
        set(value: HistoryDensity) {
            store.set(value);
            try { storage?.setItem(historyDensityKey, value); } catch { /* session density still works without persistence */ }
        },
    };
}

let storage: Storage | undefined;
try { if (typeof localStorage !== "undefined") storage = localStorage; } catch { /* retain the default when storage is blocked */ }
export let historyDensity = createHistoryDensity(storage);
let coarsePointer = readable(false, set => {
    let media = window.matchMedia("(pointer: coarse)");
    let update = () => set(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
});
export function historyRowSize(density: HistoryDensity, coarse: boolean) {
    return density === "tall" ? revisionTallRowHeight : coarse ? 44 : revisionRowHeight;
}
export function revisionNodeOffset(rowHeight: number, authorSpace = 0) {
    return (rowHeight - authorSpace) / 2;
}
export let historyRowHeight = derived([historyDensity, coarsePointer], ([density, coarse]) => historyRowSize(density, coarse));
export function anchoredHistoryScroll(scrollTop: number, fromHeight: number, toHeight: number) {
    return scrollTop / fromHeight * toHeight;
}
