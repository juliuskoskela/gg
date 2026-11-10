import type { RevChange } from "../messages/RevChange";

export interface TreeRow {
    path: string;
    name: string;
    depth: number;
    kind: "folder" | "file";
    change?: RevChange;
    // changed files beneath a folder; 1 for a changed file, 0 otherwise
    changed: number;
    expanded?: boolean;
}

export interface TreeOptions {
    files: readonly string[];
    changes: readonly RevChange[];
    expanded: ReadonlySet<string>;
    filter: string;
    changedOnly: boolean;
}

interface Node {
    path: string;
    name: string;
    folders: Map<string, Node>;
    files: string[];
    changed: number;
    shown: number;
}

let collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
let compare = (a: string, b: string) => collator.compare(a, b) || (a < b ? -1 : a > b ? 1 : 0);

export function ancestors(path: string): string[] {
    let parts = path.split("/");
    let result: string[] = [];
    for (let i = 1; i < parts.length; i++) result.push(parts.slice(0, i).join("/"));
    return result;
}

// every ancestor folder of a changed file, so the changes are visible on first view
export function defaultExpanded(changes: readonly RevChange[]): Set<string> {
    let folders = new Set<string>();
    for (let change of changes) for (let folder of ancestors(change.path.repo_path)) folders.add(folder);
    return folders;
}

export function treeSummary(files: readonly string[], changes: readonly RevChange[]) {
    let known = new Set(files);
    let extra = 0;
    for (let change of changes) if (!known.has(change.path.repo_path)) extra++;
    return { files: files.length + extra, changed: changes.length };
}

export function visibleRows({ files, changes, expanded, filter, changedOnly }: TreeOptions): TreeRow[] {
    let byPath = new Map<string, RevChange>();
    for (let change of changes) byPath.set(change.path.repo_path, change);
    let needle = filter.trim().toLocaleLowerCase();
    let root: Node = { path: "", name: "", folders: new Map(), files: [], changed: 0, shown: 0 };
    let insert = (path: string) => {
        let parts = path.split("/");
        let node = root;
        let changed = byPath.has(path) ? 1 : 0;
        let matches = (!needle || path.toLocaleLowerCase().includes(needle)) && (!changedOnly || changed > 0);
        node.changed += changed;
        node.shown += matches ? 1 : 0;
        for (let i = 0; i < parts.length - 1; i++) {
            let folderPath = parts.slice(0, i + 1).join("/");
            let next = node.folders.get(parts[i]);
            if (!next) node.folders.set(parts[i], next = { path: folderPath, name: parts[i], folders: new Map(), files: [], changed: 0, shown: 0 });
            node = next;
            node.changed += changed;
            node.shown += matches ? 1 : 0;
        }
        node.files.push(path);
    };
    let seen = new Set<string>();
    for (let path of files) { if (!seen.has(path)) { seen.add(path); insert(path); } }
    for (let path of byPath.keys()) if (!seen.has(path)) insert(path);

    let rows: TreeRow[] = [];
    let narrowed = needle !== "" || changedOnly;
    let walk = (node: Node, depth: number) => {
        let folders = [...node.folders.values()].sort((a, b) => compare(a.name, b.name));
        for (let folder of folders) {
            if (narrowed && !folder.shown) continue;
            // a filter opens every folder that holds a match
            let open = needle !== "" || expanded.has(folder.path);
            rows.push({ path: folder.path, name: folder.name, depth, kind: "folder", changed: folder.changed, expanded: open });
            if (open) walk(folder, depth + 1);
        }
        let names = node.files.map(path => ({ path, name: path.slice(path.lastIndexOf("/") + 1) })).sort((a, b) => compare(a.name, b.name));
        for (let { path, name } of names) {
            let change = byPath.get(path);
            if (changedOnly && !change) continue;
            if (needle && !path.toLocaleLowerCase().includes(needle)) continue;
            rows.push({ path, name, depth, kind: "file", change, changed: change ? 1 : 0 });
        }
    };
    walk(root, 0);
    return rows;
}
