import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { render, waitFor } from "@testing-library/svelte";
import type { LogPage } from "./messages/LogPage";
import { setupMocks, cleanupMocks } from "./mocks";

describe("LogPane", () => {
    beforeAll(() => {
        setupMocks((cmd, _args) => {
            if (cmd === "query_log") {
                let emptyPage: LogPage = { rows: [], has_more: false };
                return emptyPage;
            }
            return undefined;
        });
    });

    afterAll(async () => {
        await cleanupMocks();
    });

    it("renders loading state", async () => {
        const { default: LogPane } = await import("./LogPane.svelte");

        const { container } = render(LogPane, {
            props: {
                query_choices: { default: "all()" },
                latest_query: "all()",
            },
        });

        expect(container.textContent).toContain("Loading");
    });

    it("renders empty log with mocked IPC", async () => {
        const { default: LogPane } = await import("./LogPane.svelte");

        const { container } = render(LogPane, {
            props: {
                query_choices: { default: "all()" },
                latest_query: "all()",
            },
        });

        await waitFor(() => {
            expect(container.textContent).not.toContain("Loading");
        });
    });
});

describe("LogPane (query requests)", () => {
    let revsets: string[];

    beforeEach(() => {
        revsets = [];
        setupMocks((cmd, args) => {
            if (cmd === "query_log") {
                revsets.push(args.revset as string);
                let emptyPage: LogPage = { rows: [], has_more: false };
                return emptyPage;
            }
            return undefined;
        });
    });

    afterEach(async () => {
        await cleanupMocks();
    });

    it("a logQueryRequest repoints the log and shows up in the revset box", async () => {
        const { default: LogPane } = await import("./LogPane.svelte");
        const { logQueryRequest } = await import("./stores");
        const { get } = await import("svelte/store");
        logQueryRequest.set(null);

        const { container } = render(LogPane, {
            props: {
                query_choices: { default: "all()" },
                latest_query: "all()",
            },
        });

        await waitFor(() => expect(revsets).toEqual(["all()"]));

        logQueryRequest.set('files("a.txt")');

        await waitFor(() => expect(revsets).toEqual(["all()", 'files("a.txt")']));

        // the request is one-shot, and the new revset is editable in the header
        expect(get(logQueryRequest)).toBe(null);
        let input = container.querySelector("input")!;
        expect(input.value).toBe('files("a.txt")');
    });
});

describe("LogPane page publication", () => {
    let releasePage: ((page: LogPage) => void) | undefined;
    let second: LogPage;
    beforeEach(() => {
        let revision = (id: string) => ({
            id: { change: { type: "ChangeId" as const, hex: id, prefix: id, rest: "", offset: null, is_divergent: false }, commit: { type: "CommitId" as const, hex: id, prefix: id, rest: "" } },
            description: { lines: [`Revision ${id}`] }, refs: [], parent_ids: [],
            is_immutable: false, is_working_copy: false, has_conflict: false, working_copy_of: null,
            author: { name: "Test", email: "test@example.com", timestamp: "2026-01-01T12:00:00Z" },
        });
        let first: LogPage = { has_more: true, rows: [{ revision: revision("a"), location: [0, 0], padding: 0, lines: [{ type: "ToIntersection", source: [0, 0], target: [1, 1], indirect: false }] }] };
        second = { has_more: false, rows: [{ revision: revision("b"), location: [1, 1], padding: 0, lines: [] }] };
        setupMocks(command => {
            if (command === "query_log") return first;
            if (command === "query_log_next_page") return new Promise<LogPage>(resolve => { releasePage = resolve; });
            return undefined;
        });
    });
    afterEach(async () => { releasePage?.(second); releasePage = undefined; await cleanupMocks(); });

    it("shows an initial page and updates it when the next page completes an edge", async () => {
        let { default: LogPane } = await import("./LogPane.svelte");
        let view = render(LogPane, { props: { query_choices: { default: "all()" }, latest_query: "all()" } });
        await waitFor(() => expect(view.container.textContent).toContain("1 revision"));
        let firstRow = view.container.querySelector(".graph .selection-item");
        expect(firstRow?.textContent).toContain("Revision a");
        await waitFor(() => expect(releasePage).toBeTypeOf("function"));
        releasePage!(second);
        await waitFor(() => expect(view.container.textContent).toContain("2 revisions"));
        expect(view.container.querySelector(".graph .selection-item")).toBe(firstRow);
        expect(view.container.querySelector(".graph > g > path")).not.toBeNull();
    });
});
