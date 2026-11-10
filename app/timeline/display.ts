import { writable } from "svelte/store";

/** what timeline rows show besides the description; authors are the tall density in graphLayout */
export type TimelineDisplay = { change: boolean; commit: boolean; stats: boolean; bookmarks: boolean; tags: boolean };
const KEY = "gg.timeline.display";
// the first version stored only the two ids
const LEGACY_KEY = "gg.timeline.ids";
const DEFAULT: TimelineDisplay = { change: true, commit: false, stats: true, bookmarks: true, tags: true };

function restore(storage?: Pick<Storage, "getItem">): TimelineDisplay {
    for (let key of [KEY, LEGACY_KEY]) {
        try {
            let value = JSON.parse(storage?.getItem(key) ?? "null");
            if (value && typeof value === "object") {
                let restored = { ...DEFAULT };
                for (let option of Object.keys(DEFAULT) as (keyof TimelineDisplay)[]) if (typeof value[option] === "boolean") restored[option] = value[option];
                return restored;
            }
        } catch { /* try the next key, then the default */ }
    }
    return DEFAULT;
}

export function createTimelineDisplay(storage?: Pick<Storage, "getItem" | "setItem">) {
    let store = writable<TimelineDisplay>(restore(storage));
    return {
        subscribe: store.subscribe,
        toggle(option: keyof TimelineDisplay) {
            store.update(value => {
                let next = { ...value, [option]: !value[option] };
                try { storage?.setItem(KEY, JSON.stringify(next)); } catch { /* the choice lasts this session */ }
                return next;
            });
        },
    };
}

let storage: Storage | undefined;
try { if (typeof localStorage !== "undefined") storage = localStorage; } catch { /* storage can be blocked */ }
export let timelineDisplay = createTimelineDisplay(storage);
