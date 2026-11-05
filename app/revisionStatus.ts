import type { RevHeader } from "./messages/RevHeader";
import type { StoreRef } from "./messages/StoreRef";

export type BookmarkRef = Extract<StoreRef, { type: "LocalBookmark" | "RemoteBookmark" }>;

export function revisionStatuses(header: RevHeader): string[] {
    let statuses: string[] = [];
    if (header.has_conflict) statuses.push("Unresolved conflict");
    if (header.id.change.is_divergent) statuses.push("Divergent change");
    if (header.is_working_copy) statuses.push(header.working_copy_of ? `Working copy: ${header.working_copy_of}` : "Working copy");
    if (header.is_immutable) statuses.push("Immutable revision");
    return statuses;
}

export function revisionLabel(header: RevHeader): string {
    return [header.description.lines[0] || "No description set", header.id.change.hex, ...revisionStatuses(header)].join("; ");
}

export function bookmarkStatus(ref: BookmarkRef): string {
    let status: string;
    if (ref.type === "LocalBookmark") {
        if (ref.available_remotes === 0 && ref.potential_remotes > 0) status = "Local only";
        else if (ref.is_synced) status = "Synced";
        else status = "Not synced";
        if (ref.tracking_remotes.length) status += `; tracking ${ref.tracking_remotes.join(", ")}`;
    } else if (ref.is_tracked && ref.is_absent) status = "Deleting remote bookmark";
    else if (!ref.is_tracked) status = "Untracked remote bookmark";
    else status = ref.is_synced ? "Tracked; synced" : "Tracked; not synced";
    return ref.has_conflict ? `Conflicted bookmark; ${status}` : status;
}

export function bookmarkLabel(ref: BookmarkRef): string {
    let name = ref.type === "LocalBookmark" ? ref.bookmark_name : `${ref.bookmark_name}@${ref.remote_name}`;
    return `${name}; ${bookmarkStatus(ref)}`;
}
