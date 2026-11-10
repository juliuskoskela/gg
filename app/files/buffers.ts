import { writable } from "svelte/store";

/** unsaved text of a working-copy file, and the version it was edited from */
export type Buffer = { text: string; version: string };

function keyOf(scope: string, path: string) {
    return `${scope}\0${path}`;
}

/** edits survive switching files or revisions; a buffer equal to its base is not kept */
export function createBuffers() {
    let store = writable<ReadonlyMap<string, Buffer>>(new Map());
    let current: Map<string, Buffer> = new Map();
    function commit(next: Map<string, Buffer>) {
        current = next;
        store.set(next);
    }
    return {
        subscribe: store.subscribe,
        get(scope: string, path: string): Buffer | undefined {
            return current.get(keyOf(scope, path));
        },
        /** records an edit, or forgets the buffer when the text is back to what was loaded */
        edit(scope: string, path: string, text: string, base: { text: string; version: string }) {
            let key = keyOf(scope, path);
            if (text === base.text) {
                if (current.has(key)) discard(key);
                return;
            }
            let existing = current.get(key);
            if (existing && existing.text === text && existing.version === base.version) return;
            commit(new Map(current).set(key, { text, version: base.version }));
        },
        discard(scope: string, path: string) {
            discard(keyOf(scope, path));
        },
        /** paths with unsaved edits in one repository */
        dirtyPaths(scope: string): Set<string> {
            return dirtyPaths(current, scope);
        },
        clear() { commit(new Map()); },
    };
    function discard(key: string) {
        let next = new Map(current);
        if (next.delete(key)) commit(next);
    }
}

export function dirtyPaths(buffers: ReadonlyMap<string, Buffer>, scope: string): Set<string> {
    let prefix = `${scope}\0`;
    let paths = new Set<string>();
    for (let key of buffers.keys()) if (key.startsWith(prefix)) paths.add(key.slice(prefix.length));
    return paths;
}

export let fileBuffers = createBuffers();
