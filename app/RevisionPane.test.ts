import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, fireEvent } from "@testing-library/svelte";
import type { RevsResult } from "./messages/RevsResult";
import { setupMocks, cleanupMocks } from "./mocks";

function createMockRevs(
    commitHex = "deadbeef1234",
    changeHex = "abc123def456",
    description = "Test commit message",
): Extract<RevsResult, { type: "Detail" }> {
    let mockId = {
        change: {
            type: "ChangeId" as const,
            hex: changeHex,
            prefix: changeHex.slice(0, 3),
            rest: changeHex.slice(3),
            offset: null,
            is_divergent: false,
        },
        commit: {
            type: "CommitId" as const,
            hex: commitHex,
            prefix: commitHex.slice(0, 4),
            rest: commitHex.slice(4),
        },
    };

    return {
        type: "Detail",
        set: {
            from: mockId,
            to: mockId,
        },
        headers: [
            {
                id: mockId,
                description: { lines: [description] },
                author: {
                    email: "test@example.com",
                    name: "Test User",
                    timestamp: "2024-01-15T12:00:00Z",
                },
                has_conflict: false,
                is_working_copy: false,
                working_copy_of: null,
                is_immutable: false,
                refs: [],
                parent_ids: [],
            },
        ],
        parents: [],
        changes: [],
        conflicts: [],
    };
}

describe("RevisionPane", () => {
    beforeEach(async () => {
        setupMocks();
        localStorage.clear();
        let { descriptionDrafts } = await import("./stores");
        descriptionDrafts.set({});
    });

    afterEach(async () => {
        await cleanupMocks();
    });

    it("renders revision details with mocked data", async () => {
        const { default: RevisionPane } = await import("./RevisionPane.svelte");

        let mockRevs = createMockRevs();
        const { container } = render(RevisionPane, {
            props: {
                revs: mockRevs,
            },
        });

        // should display the change id
        expect(container.textContent).toContain("abc123de");

        // should display the commit id
        expect(container.textContent).toContain("deadbeef");

        // should display the description in the textarea
        await fireEvent.click(container.querySelector<HTMLButtonElement>('button[aria-label="Edit revision description"]')!);
        let textarea = container.querySelector("textarea");
        expect(textarea).not.toBeNull();
        expect(textarea?.value).toBe("Test commit message");

        // should display the author
        expect(container.textContent).toContain("Test User");
    });

    it("keeps description and metadata visible and updates them on selection", async () => {
        let { default: RevisionPane } = await import("./RevisionPane.svelte");
        let revs = createMockRevs();
        revs.headers[0].is_working_copy = true;
        revs.headers[0].description.lines = ["A useful title", "", "A longer description body."];
        let { container, rerender } = render(RevisionPane, { props: { revs } });
        expect(container.querySelector(".overview h2")?.textContent).toBe("A useful title");
        expect(container.querySelector(".description-body")?.textContent).toBe("A longer description body.");
        expect(container.querySelector(".disclosure")).toBeNull();
        expect(container.querySelector('[aria-label="Revision metadata"]')?.textContent).toContain("Test User");
        await rerender({ revs: createMockRevs("other", "other", "Another title") });
        expect(container.querySelector(".overview h2")?.textContent).toBe("Another title");
        await rerender({ revs: createMockRevs("empty", "empty", "") });
        expect(container.querySelector(".overview h2")?.textContent).toBe("No description set");
    });

    it("renders bookmarks, tags and parents in shared metadata rows", async () => {
        let { default: RevisionPane } = await import("./RevisionPane.svelte");
        let { revisionFixture } = await import("./design/revisionFixture");
        let { container } = render(RevisionPane, { props: { revs: revisionFixture }, context: new Map([["settings", { markUnpushedBookmarks: true }]]) });
        let rows = [...container.querySelectorAll(".metadata-row")];
        expect(rows.map(row => row.querySelector("dt")?.textContent)).toEqual(["Status", "Author", "Authored", "Change", "Commit", "Bookmarks", "Tags", "Parent"]);
        expect(container.querySelector('[aria-label="Revision tags"]')?.textContent).toContain("v0.46.0");
        expect(container.querySelector('[aria-label="Revision bookmarks"]')?.textContent).toContain("Local only");
        expect(container.querySelector(".parents")?.textContent).toContain("Keep repository context");
    });

    it("keeps metadata labels clear of values when text is enlarged", async () => {
        let { default: RevisionPane } = await import("./RevisionPane.svelte");
        let { revisionFixture } = await import("./design/revisionFixture");
        let { container } = render(RevisionPane, { props: { revs: revisionFixture }, context: new Map([["settings", { markUnpushedBookmarks: true }]]) });
        container.style.width = "760px";
        container.style.setProperty("--type-ui", "26px");
        for (let row of container.querySelectorAll(".metadata-row")) {
            let label = row.querySelector("dt")!;
            let value = row.querySelector("dd")!;
            expect(label.getBoundingClientRect().right).toBeLessThan(value.getBoundingClientRect().left);
            expect(label.scrollWidth).toBeLessThanOrEqual(label.clientWidth);
        }
        let columns = getComputedStyle(container.querySelector(".metadata-row")!).gridTemplateColumns;
        expect(parseFloat(columns)).toBeCloseTo(26 * (window.matchMedia("(max-width: 600px)").matches ? 68 / 14 : 80 / 13), 1);
    });

    it("keeps a draft scoped to its exact commit and restores it on return", async () => {
        const { default: RevisionPane } = await import("./RevisionPane.svelte");

        let { container, rerender } = render(RevisionPane, {
            props: { revs: createMockRevs() },
        });

        await fireEvent.click(container.querySelector<HTMLButtonElement>('button[aria-label="Edit revision description"]')!);
        let textarea = container.querySelector("textarea")!;
        textarea.value = "desc";
        await fireEvent.input(textarea);

        await rerender({ revs: createMockRevs("feed5678abcd") });
        expect(container.querySelector("textarea")).toBeNull();
        await rerender({ revs: createMockRevs() });
        expect(container.querySelector("textarea")?.value).toBe("desc");
    });

    it("updates the authored date when selecting another revision", async () => {
        let { default: RevisionPane } = await import("./RevisionPane.svelte");
        let { container, rerender } = render(RevisionPane, { props: { revs: createMockRevs() } });
        let previous = container.querySelector(".timestamp")!.textContent;
        let next = createMockRevs("other", "other");
        next.headers[0].author.timestamp = "2035-06-01T12:00:00Z";
        await rerender({ revs: next });
        expect(container.querySelector(".timestamp")!.textContent).not.toBe(previous);
        expect(container.querySelector(".timestamp")!.getAttribute("title")).toBe(new Date(next.headers[0].author.timestamp).toLocaleString());
    });

    it("does not carry a draft to a different commit when remounting", async () => {
        const { default: RevisionPane } = await import("./RevisionPane.svelte");

        let first = render(RevisionPane, { props: { revs: createMockRevs() } });
        await fireEvent.click(first.container.querySelector<HTMLButtonElement>('button[aria-label="Edit revision description"]')!);
        let textarea = first.container.querySelector("textarea")!;
        textarea.value = "desc";
        await fireEvent.input(textarea);
        first.unmount();

        let second = render(RevisionPane, { props: { revs: createMockRevs("feed5678abcd") } });

        expect(second.container.querySelector("textarea")).toBeNull();
        second.unmount();
        let original = render(RevisionPane, { props: { revs: createMockRevs() } });
        expect(original.container.querySelector("textarea")?.value).toBe("desc");
    });

    it("does not carry a description draft into a different change", async () => {
        const { default: RevisionPane } = await import("./RevisionPane.svelte");

        let first = render(RevisionPane, { props: { revs: createMockRevs() } });
        await fireEvent.click(first.container.querySelector<HTMLButtonElement>('button[aria-label="Edit revision description"]')!);
        let textarea = first.container.querySelector("textarea")!;
        textarea.value = "desc";
        await fireEvent.input(textarea);
        first.unmount();

        let second = render(RevisionPane, {
            props: { revs: createMockRevs("feed5678abcd", "999888777666", "Other message") },
        });

        expect(second.container.textContent).toContain("Other message");
        expect(second.container.querySelector("textarea")).toBeNull();
    });
    it("restores each revision's draft when navigating away and back", async () => {
        let { default: RevisionPane } = await import("./RevisionPane.svelte");
        let firstRevision = createMockRevs();
        let { container, rerender } = render(RevisionPane, { props: { revs: firstRevision } });
        await fireEvent.click(container.querySelector<HTMLButtonElement>('button[aria-label="Edit revision description"]')!);
        await fireEvent.input(container.querySelector("textarea")!, { target: { value: "Unfinished description" } });
        await rerender({ revs: createMockRevs("other", "other", "Another revision") });
        expect(container.textContent).toContain("Another revision");
        await rerender({ revs: firstRevision });
        expect(container.querySelector("textarea")?.value).toBe("Unfinished description");
    });

    it("offers an empty working-copy field immediately without stealing focus", async () => {
        let { default: RevisionPane } = await import("./RevisionPane.svelte");
        let revs = createMockRevs("empty", "empty", "");
        revs.headers[0].is_working_copy = true;
        let { container, getByRole } = render(RevisionPane, { props: { revs } });
        let field = getByRole("textbox", { name: "Revision description" }) as HTMLTextAreaElement;
        expect(field.value).toBe("");
        expect(field.placeholder).toBe("Describe this change…");
        expect(document.activeElement).not.toBe(field);
        expect(container.querySelector('[aria-label="Edit revision description"]')).toBeNull();
        expect(container.querySelector('[aria-label="Revision actions"]')).toBeNull();
        await fireEvent.input(field, { target: { value: "A new description" } });
        await fireEvent.keyDown(field, { key: "Escape" });
        expect(field.value).toBe("");
        expect(container.querySelector('[aria-label="Revision metadata"]')?.textContent).toContain("Test User");
    });

    it("edits the description text and returns focus to it on cancel", async () => {
        let { default: RevisionPane } = await import("./RevisionPane.svelte");
        let { getByRole, container } = render(RevisionPane, { props: { revs: createMockRevs() } });
        let link = getByRole("button", { name: "Edit revision description" });
        expect(link.textContent).toBe("Test commit message");
        link.focus();
        await fireEvent.click(link);
        let field = getByRole("textbox", { name: "Revision description" });
        expect(document.activeElement).toBe(field);
        await fireEvent.keyDown(field, { key: "Escape" });
        await new Promise(resolve => requestAnimationFrame(resolve));
        expect(document.activeElement).toBe(getByRole("button", { name: "Edit revision description" }));
        expect(container.textContent).not.toContain("Edit description");
    });
});
