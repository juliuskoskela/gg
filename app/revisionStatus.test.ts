import { describe, expect, it } from "vitest";
import { bookmarkLabel, bookmarkStatus, revisionLabel, revisionStatuses } from "./revisionStatus";
import type { BookmarkRef } from "./revisionStatus";
import type { RevHeader } from "./messages/RevHeader";

let local: BookmarkRef = { type: "LocalBookmark", bookmark_name: "release", has_conflict: false, is_synced: false, tracking_remotes: [], available_remotes: 0, potential_remotes: 1 };
let remote: BookmarkRef = { type: "RemoteBookmark", bookmark_name: "release", remote_name: "origin", has_conflict: false, is_synced: true, is_tracked: true, is_absent: false };

describe("semantic revision and bookmark status", () => {
    it("keeps simultaneous revision states in the accessible identity", () => {
        let header = { description: { lines: ["Fix parser"] }, id: { change: { hex: "abcdef", is_divergent: true } }, has_conflict: true, is_working_copy: true, working_copy_of: "review", is_immutable: true } as RevHeader;
        expect(revisionStatuses(header)).toEqual(["Unresolved conflict", "Divergent change", "Working copy: review", "Immutable revision"]);
        expect(revisionLabel(header)).toBe("Fix parser; abcdef; Unresolved conflict; Divergent change; Working copy: review; Immutable revision");
    });
    it("distinguishes local lifecycle without empty tracking text", () => {
        expect(bookmarkStatus(local)).toBe("Local only");
        expect(bookmarkStatus({ ...local, available_remotes: 1 })).toBe("Not synced");
        expect(bookmarkStatus({ ...local, available_remotes: 1, is_synced: true, tracking_remotes: ["origin"] })).toBe("Synced; tracking origin");
    });
    it("preserves conflict alongside remote lifecycle", () => {
        expect(bookmarkLabel(remote)).toBe("release@origin; Tracked; synced");
        expect(bookmarkStatus({ ...remote, is_tracked: false })).toBe("Untracked remote bookmark");
        expect(bookmarkStatus({ ...remote, has_conflict: true, is_absent: true })).toBe("Conflicted bookmark; Deleting remote bookmark");
    });
});
