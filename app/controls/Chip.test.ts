import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render } from "@testing-library/svelte";
import { cleanupMocks, setupMocks } from "../mocks";
import type { RevHeader } from "../messages/RevHeader";
import "../global.css";

let id = { change: { type: "ChangeId" as const, hex: "abc", prefix: "a", rest: "bc", offset: null, is_divergent: false }, commit: { type: "CommitId" as const, hex: "123", prefix: "1", rest: "23" } };
let header: RevHeader = { id, description: { lines: ["Change"] }, refs: [], parent_ids: [], is_immutable: false, is_working_copy: false, has_conflict: false, working_copy_of: null, author: { name: "Test", email: "", timestamp: "" } };

describe("reference chip tones", () => {
    beforeEach(() => setupMocks());
    afterEach(async () => cleanupMocks());
    it("keeps neutral defaults and explicit drop and disconnected indicators", async () => {
        let { default: Chip } = await import("./Chip.svelte");
        let { container, rerender } = render(Chip, { props: { context: false, target: false } });
        container.style.cssText = "--text:#e8e9ec;--muted:#a3a7b0;--control:#555b65;--hover:#343943;--ref-bookmark:#97b2ce;--ref-remote:#9ba7b7";
        let chip = container.querySelector<HTMLElement>(".chip")!;
        expect(chip.dataset.tone).toBe("neutral");
        await rerender({ context: false, target: true, disconnected: true, tone: "bookmark" });
        expect(chip.dataset.tone).toBe("bookmark");
        expect(getComputedStyle(chip).outlineWidth).toBe("2px");
        expect(getComputedStyle(chip).borderStyle).toBe("dashed");
        await rerender({ context: true, target: false, disconnected: false, tone: "remote" });
        expect(chip.classList.contains("context")).toBe(true);
        expect(getComputedStyle(chip).borderStyle).toBe("solid");
    });
    it("updates bookmark role tones and retains lifecycle and conflict information", async () => {
        let { default: BookmarkObject } = await import("../objects/BookmarkObject.svelte");
        let ref = { type: "LocalBookmark" as const, bookmark_name: "main", has_conflict: false, is_synced: false, tracking_remotes: [], available_remotes: 0, potential_remotes: 1 };
        let { container, rerender } = render(BookmarkObject, { context: new Map([["settings", { markUnpushedBookmarks: true }]]), props: { header, ref } });
        container.style.cssText = "--text:#e8e9ec;--muted:#a3a7b0;--control:#555b65;--hover:#343943;--ref-bookmark:#97b2ce;--ref-remote:#9ba7b7";
        let chip = container.querySelector<HTMLElement>(".chip")!;
        expect(chip.dataset.tone).toBe("bookmark");
        expect(chip.title).toContain("Local only");
        expect(chip.querySelectorAll("svg").length).toBe(2);
        let remote = { type: "RemoteBookmark" as const, bookmark_name: "main", remote_name: "origin", has_conflict: true, is_synced: false, is_tracked: false, is_absent: false };
        await rerender({ header, ref: remote });
        expect(chip.dataset.tone).toBe("remote");
        expect(chip.textContent).toContain("main@origin");
        expect(chip.title).toContain("Conflicted bookmark");
        expect(chip.querySelector('use[href$="#alert-triangle"]')).not.toBeNull();
        expect(chip.querySelector("svg.remove")).not.toBeNull();
        expect(chip.querySelector(":scope > span")).not.toBeNull();
        expect(chip.querySelector(":scope > svg:first-child")).not.toBeNull();
    });
    it("applies distinct workspace and tag tones without changing labels", async () => {
        let { default: WorkspaceObject } = await import("../objects/WorkspaceObject.svelte");
        let { default: TagObject } = await import("../objects/TagObject.svelte");
        let workspace = render(WorkspaceObject, { props: { name: "review" } });
        expect(workspace.container.querySelector(".chip")?.getAttribute("data-tone")).toBe("workspace");
        expect(workspace.getByRole("option").getAttribute("aria-label")).toBe("review");
        let tag = render(TagObject, { props: { header, ref: { type: "Tag", tag_name: "v1.0" } } });
        expect(tag.container.querySelector(".chip")?.getAttribute("data-tone")).toBe("tag");
        expect(tag.container.textContent?.trim()).toBe("v1.0");
    });
});
