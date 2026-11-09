import { getContext, setContext, type Snippet } from "svelte";
import { writable, type Readable } from "svelte/store";

export interface ToolbarContribution {
    readonly id: number;
    readonly content: Snippet;
}

export interface ToolbarRegistry extends Readable<ReadonlyMap<string, readonly ToolbarContribution[]>> {
    contribute(owner: string): { update(content: Snippet | undefined): void; dispose(): void };
}

// handles own their entries; removing one extension must not remove its neighbours.
export function createToolbarRegistry(): ToolbarRegistry {
    let entries = writable<ReadonlyMap<string, readonly ToolbarContribution[]>>(new Map());
    let sequence = 0;
    return {
        subscribe: entries.subscribe,
        contribute(owner) {
            let id = sequence++;
            let disposed = false;
            function update(content: Snippet | undefined) {
                if (disposed) return;
                entries.update(current => {
                    let contributions = (current.get(owner) ?? []).filter(entry => entry.id !== id);
                    if (content) contributions.push({ id, content });
                    contributions.sort((a, b) => a.id - b.id);
                    let next = new Map(current);
                    if (contributions.length) next.set(owner, contributions);
                    else next.delete(owner);
                    return next;
                });
            }
            return { update, dispose() { update(undefined); disposed = true; } };
        }
    };
}

let groupKey = Symbol("view toolbars");
let viewKey = Symbol("toolbar owner");

export function provideToolbars() {
    let registry = createToolbarRegistry();
    setContext(groupKey, registry);
    return registry;
}

export function useToolbars(): ToolbarRegistry | undefined { return getContext(groupKey); }
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
