import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { render, waitFor } from "@testing-library/svelte";
import { setupMocks, cleanupMocks } from "../mocks";

beforeAll(() => setupMocks((command, args) => {
    if (command === "query_operation_preflight") return args.redo
        ? { eligible: false, description: null, reason: "Nothing to redo" }
        : { eligible: true, description: "describe abcdef0123456789", reason: null };
    return undefined;
}));
afterAll(async () => cleanupMocks());

describe("current operation", () => {
    it("shows authoritative eligibility and abbreviates identifiers", async () => {
        let { default: OperationView } = await import("./OperationView.svelte");
        let view = render(OperationView, { props: { status: { operation_description: "snapshot abcdef0123456789", working_copy: { type: "CommitId", hex: "abc", prefix: "a", rest: "bc" }, can_redo: false } } });
        await waitFor(() => expect(view.getByRole("button", { name: "Undo" }).hasAttribute("disabled")).toBe(false));
        expect(view.getByRole("button", { name: "Redo" }).hasAttribute("disabled")).toBe(true);
        expect(view.getByText("Nothing to redo")).toBeTruthy();
        expect(view.getByText("describe abcdef01").getAttribute("title")).toBe("describe abcdef0123456789");
        expect(view.getByText("Working-copy changes are recorded before Undo.")).toBeTruthy();
    });
});
