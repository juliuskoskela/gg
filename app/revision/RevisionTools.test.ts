import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render } from "@testing-library/svelte";
import { tick } from "svelte";
import { cleanupMocks, setupMocks } from "../mocks";
import { operationState } from "../operations";
import { currentMutation, ignoreToggled, revisionSelectEvent } from "../stores";
import type { RevHeader } from "../messages/RevHeader";
import RevisionTools from "./RevisionTools.svelte";

let id = { change: { type: "ChangeId" as const, hex: "change", prefix: "c", rest: "hange", offset: null, is_divergent: false }, commit: { type: "CommitId" as const, hex: "commit", prefix: "c", rest: "ommit" } };
let header: RevHeader = { id, description: { lines: ["Refine workspace"] }, refs: [], parent_ids: [id.commit], is_immutable: false, is_working_copy: false, has_conflict: false, working_copy_of: null, author: { name: "Test", email: "test@example.com", timestamp: "" } };

describe("revision tools", () => {
    beforeEach(() => {
        setupMocks();
        currentMutation.set(null);
        operationState.set(null);
        ignoreToggled.set(false);
        revisionSelectEvent.set({ from: id, to: id });
    });
    afterEach(async () => { await cleanupMocks(); operationState.set(null); currentMutation.set(null); ignoreToggled.set(false); });

    it("shows quiet command groups with destructive actions last", () => {
        let { getAllByRole, getByRole, queryByRole } = render(RevisionTools, { headers: [header] });
        expect(getAllByRole("region").map(group => group.getAttribute("aria-label"))).toEqual(["Create", "Rewrite", "Remove"]);
        expect(getAllByRole("button").at(-1)?.textContent).toContain("Abandon");
        expect((getByRole("button", { name: /^New child/ }) as HTMLButtonElement).disabled).toBe(false);
        expect(queryByRole("heading", { name: "Revision tools" })).toBeNull();
    });

    it("updates operation and selection guards without reopening the panel", async () => {
        let { getByRole } = render(RevisionTools, { headers: [header] });
        let button = () => getByRole("button", { name: /^New child/ }) as HTMLButtonElement;
        operationState.set({ id: 1, label: "Working", phase: "pending" });
        await tick();
        expect(button().disabled).toBe(true);
        expect(button().textContent).toContain("Another operation is in progress");
        operationState.set(null);
        await tick();
        expect(button().disabled).toBe(false);
        currentMutation.set({ type: "wait" });
        await tick();
        expect(button().disabled).toBe(true);
        currentMutation.set(null);
        revisionSelectEvent.set(undefined);
        await tick();
        expect(button().disabled).toBe(true);
        expect(button().textContent).toContain("Selection has changed");
    });

    it("updates immutable protection and exposes a reason beside unavailable commands", async () => {
        let { getByRole } = render(RevisionTools, { headers: [{ ...header, is_immutable: true }] });
        let abandon = () => getByRole("button", { name: /^Abandon/ }) as HTMLButtonElement;
        expect(abandon().disabled).toBe(true);
        expect(abandon().textContent).toContain("Immutable revisions are protected");
        expect(document.getElementById(abandon().getAttribute("aria-describedby")!)?.textContent).toBe("Immutable revisions are protected");
        ignoreToggled.set(true);
        await tick();
        expect(abandon().disabled).toBe(false);
    });

    it("keeps empty selection tools visible and disabled", () => {
        let { getAllByRole, getByRole } = render(RevisionTools, { headers: [] });
        expect(getByRole("status").textContent).toBe("Select a revision to use these tools.");
        expect(getAllByRole("button").every(button => (button as HTMLButtonElement).disabled)).toBe(true);
    });
});
