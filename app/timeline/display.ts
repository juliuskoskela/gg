import { writable } from "svelte/store";

/** which identifiers timeline rows show; authors are the tall density in graphLayout */
export type TimelineIds = { change: boolean; commit: boolean };
const KEY = "gg.timeline.ids";
const DEFAULT: TimelineIds = { change: true, commit: false };

function restore(storage?: Pick<Storage, "getItem">): TimelineIds {
    try {
        let value = JSON.parse(storage?.getItem(KEY) ?? "null");
        if (value && typeof value.change === "boolean" && typeof value.commit === "boolean") return value;
    } catch { /* fall back to the default */ }
    return DEFAULT;
}

export function createTimelineIds(storage?: Pick<Storage, "getItem" | "setItem">) {
    let store = writable<TimelineIds>(restore(storage));
    return {
        subscribe: store.subscribe,
        toggle(id: keyof TimelineIds) {
            store.update(value => {
                let next = { ...value, [id]: !value[id] };
                try { storage?.setItem(KEY, JSON.stringify(next)); } catch { /* the choice lasts this session */ }
                return next;
            });
        },
    };
}

let storage: Storage | undefined;
try { if (typeof localStorage !== "undefined") storage = localStorage; } catch { /* storage can be blocked */ }
export let timelineIds = createTimelineIds(storage);
