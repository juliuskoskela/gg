import type { AnnotationAnchor } from "../messages/AnnotationAnchor";
import type { ChangeHunk } from "../messages/ChangeHunk";
import type { Operand } from "../messages/Operand";
import type { RevHeader } from "../messages/RevHeader";
import type { RevChange } from "../messages/RevChange";

export type AnchorDraft = { anchor: AnnotationAnchor; subject: string };

function ids(header: RevHeader) {
    return { change_id: header.id.change.hex, commit_id: header.id.commit.hex };
}

export function subjectOf(header: RevHeader): string {
    return header.description.lines.find(line => line.trim())?.trim() ?? "";
}

/** the new side of a hunk, which is what people usually mean when pointing at changed code */
export function hunkAnchor(header: RevHeader, path: string, hunk: ChangeHunk): AnnotationAnchor {
    let lines = hunk.lines.lines.map(line => line.replace(/\r?\n$/, ""));
    let added = lines.filter(line => !line.startsWith("-") && !line.startsWith("\\"));
    if (!added.length || hunk.location.to_file.len === 0) {
        let removed = lines.filter(line => line.startsWith("-") || line.startsWith(" "));
        let start = Math.max(1, hunk.location.from_file.start);
        return { kind: "lines", ...ids(header), path, side: "old", start, end: start + Math.max(removed.length, 1) - 1, quote: removed.map(line => line.slice(1)).join("\n") };
    }
    let start = Math.max(1, hunk.location.to_file.start);
    return { kind: "lines", ...ids(header), path, side: "new", start, end: start + added.length - 1, quote: added.map(line => line.slice(1)).join("\n") };
}

export function anchorFor(operand: Operand | null | undefined): AnchorDraft | null {
    if (!operand) return null;
    if (operand.type === "Revision") return { anchor: { kind: "revision", ...ids(operand.header) }, subject: subjectOf(operand.header) };
    if (operand.type === "Ref") {
        let ref = operand.ref;
        if (ref.type === "Tag") return { anchor: { kind: "revision", ...ids(operand.header) }, subject: subjectOf(operand.header) };
        return {
            anchor: { kind: "bookmark", name: ref.bookmark_name, ...(ref.type === "RemoteBookmark" ? { remote: ref.remote_name } : {}), ...ids(operand.header) },
            subject: subjectOf(operand.header),
        };
    }
    if (operand.type === "Change") {
        // a file across several revisions has no single version to point at
        if (operand.headers.length !== 1) return null;
        let header = operand.headers[0];
        let path = operand.path.repo_path;
        if (operand.hunk) return { anchor: hunkAnchor(header, path, operand.hunk), subject: subjectOf(header) };
        return { anchor: { kind: "file", ...ids(header), path }, subject: subjectOf(header) };
    }
    return null;
}

export function fileName(path: string): string {
    return path.split("/").pop() || path;
}

/** short, scannable label; full ids stay in the details and the export */
export function anchorLabel(anchor: AnnotationAnchor): string {
    switch (anchor.kind) {
        case "revision": return `Change ${anchor.change_id.slice(0, 8)}`;
        case "bookmark": return `Bookmark ${anchor.name}${anchor.remote ? `@${anchor.remote}` : ""}`;
        case "file": return anchor.path;
        case "lines": return `${anchor.path}:${anchor.start}${anchor.end > anchor.start ? `–${anchor.end}` : ""}${anchor.side === "old" ? " (before)" : ""}`;
    }
}

export function anchorIcon(anchor: AnnotationAnchor): string {
    switch (anchor.kind) {
        case "revision": return "git-commit";
        case "bookmark": return "bookmark";
        case "file": return "file";
        case "lines": return "align-left";
    }
}

export const MAX_LINES = 500;

/** quotes from the patch when it covers the range, otherwise from the whole file */
export async function linesAnchor(header: RevHeader, change: RevChange, side: "additions" | "deletions", start: number, end: number, loadFullFiles?: (() => Promise<{ before: string; after: string }>) | null): Promise<AnnotationAnchor> {
    let found = new Map<number, string>();
    for (let hunk of change.hunks) {
        let line = side === "additions" ? hunk.location.to_file.start : hunk.location.from_file.start;
        for (let raw of hunk.lines.lines) {
            let text = raw.replace(/\r?\n$/, "");
            if (text.startsWith("\\") || text.startsWith(side === "additions" ? "-" : "+")) continue;
            if (line >= start && line <= end) found.set(line, text.slice(1));
            line++;
        }
    }
    let quote: string;
    if (found.size === end - start + 1 || !loadFullFiles) {
        quote = [...found.entries()].sort(([a], [b]) => a - b).map(([, text]) => text).join("\n");
    } else {
        let files = await loadFullFiles();
        quote = (side === "additions" ? files.after : files.before).split(/\r?\n/).slice(start - 1, end).join("\n");
    }
    return { kind: "lines", ...ids(header), path: change.path.repo_path, side: side === "additions" ? "new" : "old", start, end, quote };
}
