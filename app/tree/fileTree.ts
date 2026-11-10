import type { RevChange } from "../messages/RevChange";
import { categoryOf, fileCategories } from "../revision/fileCategories";

export interface TreeRow {
    // a group's path is its key, see groupKey
    path: string;
    name: string;
    depth: number;
    kind: "group" | "folder" | "file";
    change?: RevChange;
    // changed files beneath a folder; 1 for a changed file, 0 otherwise
    changed: number;
    // files listed in a group
    count?: number;
    expanded?: boolean;
}

/** what a host needs to draw a file row of its own */
export interface FileRowContext {
    row: TreeRow;
    index: number;
    selected: boolean;
    /** 0 for the row that holds the tab stop */
    tabindex: 0 | -1;
    /** rows in the tree, for assistive technology */
    size: number;
    activate: () => void;
}

export interface TreeOptions {
    files: readonly string[];
    changes: readonly RevChange[];
    expanded: ReadonlySet<string>;
    filter: string;
    changedOnly: boolean;
    /** top-level groups per file category, each collapsible like a folder */
    groupByType?: boolean;
    collapsedGroups?: ReadonlySet<string>;
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

const UNCHANGED = "Unchanged";

// a leading NUL keeps a group key from ever equalling a repository path
export function groupKey(value: string): string {
    return `\0group:${value}`;
}

export function visibleRows({ files, changes, expanded, filter, changedOnly, groupByType = false, collapsedGroups = new Set() }: TreeOptions): TreeRow[] {
    let byPath = new Map<string, RevChange>();
    for (let change of changes) byPath.set(change.path.repo_path, change);
    let needle = filter.trim().toLocaleLowerCase();
    let narrowed = needle !== "" || changedOnly;
    let paths: string[] = [];
    let seen = new Set<string>();
    for (let path of files) { if (!seen.has(path)) { seen.add(path); paths.push(path); } }
    for (let path of byPath.keys()) if (!seen.has(path)) paths.push(path);

    let rows: TreeRow[] = [];
    let build = (subset: string[], base: number) => {
        let root: Node = { path: "", name: "", folders: new Map(), files: [], changed: 0, shown: 0 };
        for (let path of subset) {
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
        }
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
        return { root, walk: () => walk(root, base) };
    };

    if (!groupByType) {
        build(paths, 0).walk();
        return rows;
    }
    let order = [...fileCategories.map(category => ({ value: category.value as string, label: category.label })), { value: UNCHANGED, label: UNCHANGED }];
    let members = new Map<string, string[]>();
    for (let path of paths) {
        let change = byPath.get(path);
        let value = change ? categoryOf(change) : UNCHANGED;
        let list = members.get(value);
        if (list) list.push(path); else members.set(value, [path]);
    }
    for (let { value, label } of order) {
        let subset = members.get(value);
        if (!subset) continue;
        let { root, walk } = build(subset, 1);
        if (narrowed && !root.shown) continue;
        let key = groupKey(value);
        let open = needle !== "" || !collapsedGroups.has(key);
        rows.push({ path: key, name: label, depth: 0, kind: "group", changed: root.changed, count: narrowed ? root.shown : subset.length, expanded: open });
        if (open) walk();
    }
    return rows;
}
