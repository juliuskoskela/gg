import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/svelte";
import { writable, get } from "svelte/store";
import "../../global.css";
import { reviewPlugin } from "./index";
import ReviewView from "./ReviewView.svelte";
import { controllers, createReviewController } from "./controller";
import type { PluginAPI } from "../types";
import type { PluginContext } from "../types";
import type { AnnotationList } from "../../messages/AnnotationList";
import type { RevHeader } from "../../messages/RevHeader";
import type { TargetInput } from "../../messages/TargetInput";
import type { RevSet } from "../../messages/RevSet";

let close: (() => void)[] = [];
afterEach(() => { cleanup(); close.forEach(dispose => dispose()); close = []; });
function setup() {
    let id = (change: string, commit: string) => ({ change: { type: "ChangeId" as const, hex: change, prefix: change, rest: "", is_divergent: false, offset: null }, commit: { type: "CommitId" as const, hex: commit, prefix: commit, rest: "" } });
    let headers = ["abc", "def"].map((change, i) => ({ id: id(change, `${i + 1}23`), description: { lines: [`Step ${i + 1}`] }, refs: [], parent_ids: [], author: {}, has_conflict: false, is_immutable: false, is_working_copy: false, working_copy_of: null })) as unknown as RevHeader[];
    let values = new Map<string, unknown>();
    let me = { name: "Reviewer", email: "me@example.com" };
    let notes: AnnotationList = { location: "", me: { name: "Reviewer", kind: "human" }, threads: [] };
    let query = vi.fn(async (_command: string, args: Record<string, unknown>) => {
        let set = args.set as RevSet;
        let selected = set.from.change.hex === set.to.change.hex ? headers.filter(header => header.id.change.hex === set.from.change.hex) : [...headers].reverse();
        return { type: "data", value: { type: "Detail", set, headers: selected, parents: [], changes: [], conflicts: [] } };
    });
    let api = {
        context: writable<PluginContext>({ repository: "repo", workspace: "/repo", status: undefined, selection: { from: headers[0].id, to: headers[1].id } }),
        query, annotations: async () => notes, reviews: async () => ({ me, location: "", changes: [] }),
        navigation: { select: vi.fn(async () => {}), openView: vi.fn(async () => {}) },
        storage: { keys: async () => [...values.keys()], get: async (key: string) => values.get(key), set: async (key: string, value: unknown) => { values.set(key, value); } },
        notes: {
            list: vi.fn(async () => notes),
            create: vi.fn(async (_session: string, targets: TargetInput[], body: string) => { notes = { ...notes, threads: [{ id: "core-thread", targets: targets.map(target => ({ ...target, state: { type: "current" } })), workspace: "/repo", created_at: "2026-11-01T00:00:00Z", updated_at: "2026-11-01T00:00:00Z", status: "open", posts: [{ id: "post", author: notes.me, created_at: "2026-11-01T00:00:00Z", body }] }] }; return notes; }),
            reply: vi.fn(async () => notes), edit: vi.fn(async () => notes), setStatus: vi.fn(async () => notes),
        },
    } as unknown as PluginAPI;
    let controller = createReviewController(api);
    controllers.set(api, controller);
    close.push(() => { controller.dispose(); controllers.delete(api); });
    return { api, controller, headers };
}
describe("Review view", () => {
    it("creates a named session and walks changes in timeline order through the host", async () => {
        let { api, controller, headers } = setup();
        await controller.refresh();
        let view = render(ReviewView, { api });
        await fireEvent.click(view.getByRole("button", { name: "New review" }));
        await fireEvent.input(view.getByLabelText("Title"), { target: { value: "Feature review" } });
        await fireEvent.click(view.getByRole("button", { name: "Create review" }));
        await vi.waitFor(() => expect(view.getByRole("navigation", { name: "Review changes" }).textContent).toContain("1 / 2"));
        expect(get(controller.state).sessions[0].members.map(item => item.changeId)).toEqual(["abc", "def"]);
        await fireEvent.click(view.getByRole("button", { name: "Next" }));
        await vi.waitFor(() => expect(api.navigation.select).toHaveBeenCalledWith(headers[1].id));
    });
    it("opens the scoped composer from a selected-change context command", async () => {
        let { api, controller, headers } = setup();
        controller.dispose();
        let activation = await reviewPlugin.activate(api);
        close.push(() => activation.dispose?.());
        controller = controllers.get(api)!;
        await controller.refresh();
        await controller.create("Inline review", "");
        controller.select(get(controller.state).sessions[0].id);
        let command = activation.commands![0];
        expect(command.available?.({ type: "Revision", header: headers[0] })).toBe(true);
        await command.execute({ type: "Revision", header: headers[0] });
        expect(api.navigation.openView).toHaveBeenCalledWith("sessions");
        let view = render(ReviewView, { api });
        await vi.waitFor(() => expect(view.getByLabelText("Note on selection")).toBeTruthy());
        expect(get(controller.state).draftTargets[0].anchor).toEqual({ kind: "revision", change_id: "abc", commit_id: "123" });
    });
    it("creates a shared core annotation with the session context and exact member version", async () => {
        let { api, controller } = setup();
        await controller.refresh();
        await controller.create("Review", "");
        controller.select(get(controller.state).sessions[0].id);
        let view = render(ReviewView, { api });
        await vi.waitFor(() => expect(view.getByText("No notes in this review.")).toBeTruthy());
        await fireEvent.input(view.getByLabelText("Note on this change"), { target: { value: "Keep this explicit." } });
        await fireEvent.click(view.getByRole("button", { name: "Add note" }));
        await vi.waitFor(() => expect(view.getByText("Keep this explicit.")).toBeTruthy());
        expect(api.notes.create).toHaveBeenCalledWith(get(controller.state).selected, [{ anchor: { kind: "revision", change_id: "abc", commit_id: "123" }, subject: "Step 1" }], "Keep this explicit.");
        expect(api.storage.keys).toBeDefined();
    });
});
