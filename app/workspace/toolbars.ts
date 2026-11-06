import { getContext, setContext, type Snippet } from "svelte";
import { writable, type Writable } from "svelte/store";

type Toolbars = Map<string, Snippet>;
let groupKey = Symbol("view toolbars");
let viewKey = Symbol("toolbar owner");

export function provideToolbars() {
    let toolbars = writable<Toolbars>(new Map());
    setContext(groupKey, toolbars);
    return toolbars;
}

export function useToolbars(): Writable<Toolbars> | undefined {
    return getContext(groupKey);
}

export function provideToolbarOwner(id: string) { setContext(viewKey, id); }
export function toolbarOwner(): string | undefined { return getContext(viewKey); }

// preferences survive docking and compact/desktop remounts, without persisting view state.
export let hiddenToolbars = writable<Set<string>>(new Set());
export function toggleToolbar(id: string) {
    hiddenToolbars.update(hidden => {
        let next = new Set(hidden);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
    });
}
