import type { RepoConfig } from "../messages/RepoConfig";

export type LoadError = Extract<RepoConfig, { type: "LoadError" }>;

/** what the start page offers to initialize, if anything */
export interface InitTarget {
    /** the folder that becomes the repository: the Git checkout's root when there is one */
    path: string;
    /** the folder that was opened, which may be inside `path` */
    opened: string;
    git: boolean;
    /** colocation is required to keep an existing Git repository's history */
    colocateRequired: boolean;
}

let separators = /[\\/]+/;

export function folderName(path: string): string {
    let parts = path.split(separators).filter(Boolean);
    return parts.at(-1) ?? path;
}

/** the folder containing `path`, or "" for a root */
export function parentPath(path: string): string {
    let trimmed = path.replace(/[\\/]+$/, "");
    let index = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
    if (index < 0) return "";
    return index === 0 ? trimmed.slice(0, 1) : trimmed.slice(0, index);
}

export function shortenHome(path: string, home?: string | null): string {
    if (!home) return path;
    let base = home.replace(/[\\/]+$/, "");
    if (path === base) return "~";
    let next = path.charAt(base.length);
    if (path.startsWith(base) && (next === "/" || next === "\\")) return "~" + path.slice(base.length);
    return path;
}

/**
 * splits a path so the start can ellipsize while the last folder stays readable: css can't truncate
 * in the middle on its own
 */
export function splitForTruncation(path: string): { head: string; tail: string } {
    let index = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
    if (index <= 0 || index === path.length - 1) return { head: "", tail: path };
    return { head: path.slice(0, index + 1), tail: path.slice(index + 1) };
}

/** an initialization offer for an existing folder outside any workspace; nothing for other failures */
export function initTarget(config: LoadError): InitTarget | null {
    if (config.kind !== "Uninitialized" || isPlaceForEverything(config.absolute_path, config.home_dir)) return null;
    // a dotfiles checkout at home would otherwise claim every folder under it
    let root = config.git_root && !isPlaceForEverything(config.git_root, config.home_dir) ? config.git_root : null;
    let git = !!root;
    return {
        path: root ?? config.absolute_path,
        opened: config.absolute_path,
        git,
        colocateRequired: git,
    };
}

// a launch from the desktop starts in the home folder or at the root, which nobody means to version
function isPlaceForEverything(absolute: string, homeDir?: string) {
    let path = absolute.replace(/[\\/]+$/, "");
    let home = homeDir?.replace(/[\\/]+$/, "");
    return path === "" || /^[A-Za-z]:$/.test(path) || path === home;
}

/** what went wrong opening a path, and how to fix it */
export function loadProblem(config: LoadError, recent: string[] = []): string | null {
    let path = config.absolute_path;
    let shown = shortenHome(path, config.home_dir);
    switch (config.kind) {
        case "Uninitialized":
            return null;
        case "NotFound":
            return recent.includes(path)
                ? `${shown} no longer exists. It may have been moved or deleted; choose another folder.`
                : `There is no folder at ${shown}. Check the path, or choose another folder.`;
        case "NotADirectory":
            return `${shown} is a file. Open the folder that contains the repository instead.`;
        default:
            if (!path) return config.message ? `GG couldn't open a workspace: ${config.message}` : null;
            return `GG couldn't open ${shown}: ${config.message}`;
    }
}
