import type { AnnotationTarget } from "../messages/AnnotationTarget";
import type { AnnotationAnchor } from "../messages/AnnotationAnchor";
import type { ChangeHunk } from "../messages/ChangeHunk";
import type { Operand } from "../messages/Operand";
import type { RevHeader } from "../messages/RevHeader";
import type { RevChange } from "../messages/RevChange";
import type { TargetInput } from "../messages/TargetInput";


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

/** every place an operand names: a selection of several revisions gives one target each */
export function targetsFor(operand: Operand | null | undefined): TargetInput[] {
    if (!operand) return [];
    switch (operand.type) {
        case "Revision": return [{ anchor: { kind: "revision", ...ids(operand.header) }, subject: subjectOf(operand.header) }];
        case "Revisions": return operand.headers.map(header => ({ anchor: { kind: "revision", ...ids(header) }, subject: subjectOf(header) }));
        case "Ref": {
            let ref = operand.ref;
            if (ref.type === "Tag") return [{ anchor: { kind: "revision", ...ids(operand.header) }, subject: subjectOf(operand.header) }];
            return [{ anchor: { kind: "bookmark", name: ref.bookmark_name, ...(ref.type === "RemoteBookmark" ? { remote: ref.remote_name } : {}), ...ids(operand.header) }, subject: subjectOf(operand.header) }];
        }
        case "Change": {
            let path = operand.path.repo_path;
            // a hunk belongs to one revision's patch; a file can be named in each selected revision
            if (operand.hunk) return operand.headers.length === 1 ? [{ anchor: hunkAnchor(operand.headers[0], path, operand.hunk), subject: subjectOf(operand.headers[0]) }] : [];
            return operand.headers.map(header => ({ anchor: { kind: "file", ...ids(header), path }, subject: subjectOf(header) }));
        }
        default: return [];
    }
}

export function sameAnchor(a: AnnotationAnchor, b: AnnotationAnchor) {
    return JSON.stringify(a) === JSON.stringify(b);
}

/** adds targets that aren't already present, keeping order */
export function mergeTargets(existing: TargetInput[], added: TargetInput[]): TargetInput[] {
    let result = [...existing];
    for (let target of added) if (!result.some(other => sameAnchor(other.anchor, target.anchor))) result.push(target);
    return result;
}

export function fileName(path: string): string {
    return path.split("/").pop() || path;
}

/** short, scannable label; full ids stay in the details and the export */
export function anchorLabel(anchor: AnnotationAnchor): string {
    switch (anchor.kind) {
        case "revision": return anchor.change_id.slice(0, 8);
        case "bookmark": return `${anchor.name}${anchor.remote ? `@${anchor.remote}` : ""}`;
        case "file": return fileName(anchor.path);
        case "lines": return `${fileName(anchor.path)}:${anchor.start}${anchor.end > anchor.start ? `–${anchor.end}` : ""}`;
    }
}

/** everything about a target in one sentence, for tooltips and screen readers */
export function anchorDescription(anchor: AnnotationAnchor, subject = ""): string {
    let where = anchor.kind === "revision" ? `Change ${anchor.change_id.slice(0, 12)}`
        : anchor.kind === "bookmark" ? `Bookmark ${anchorLabel(anchor)} at change ${anchor.change_id.slice(0, 12)}`
        : anchor.kind === "file" ? `${anchor.path} in change ${anchor.change_id.slice(0, 12)}`
        : `${anchor.path}, ${anchor.start === anchor.end ? `line ${anchor.start}` : `lines ${anchor.start}–${anchor.end}`}${anchor.side === "old" ? " before the change" : ""}, in change ${anchor.change_id.slice(0, 12)}`;
    return `${where}, commit ${anchor.commit_id.slice(0, 12)}${subject ? `: ${subject}` : ""}`;
}

export function anchorIcon(anchor: AnnotationAnchor): string {
    switch (anchor.kind) {
        case "revision": return "git-commit";
        case "bookmark": return "bookmark";
        case "file": return "file";
        case "lines": return "code";
    }
}

export const MAX_LINES = 500;

/** quotes from the patch when it covers the range, otherwise from the whole file */
export function shortChange(anchor: AnnotationAnchor) {
    return anchor.change_id.slice(0, 8);
}

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


/** display the verified owner without rewriting the original stored anchor */
export function effectiveAnchor(target: Pick<AnnotationTarget, "anchor" | "relocation">): AnnotationAnchor {
    let owner = target.relocation?.owner;
    return owner ? { ...target.anchor, change_id: owner.change.hex, commit_id: owner.commit.hex } : target.anchor;
}
