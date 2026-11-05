import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/svelte";
import { cleanupMocks, setupMocks } from "../mocks";

describe("input and acknowledgement dialogs", () => {
    beforeEach(() => setupMocks());
    afterEach(async () => cleanupMocks());

    it("focuses and acknowledges a zero-field message", async () => {
        let { default: InputDialog } = await import("./InputDialog.svelte");
        let response = vi.fn();
        let { getByRole, queryByRole } = render(InputDialog, {
            props: { title: "Action unavailable", detail: "The destination must resolve to one revision.", fields: [] },
            events: { response },
        });
        let button = getByRole("button", { name: "OK" });
        expect(document.activeElement).toBe(button);
        expect(queryByRole("button", { name: "Cancel" })).toBeNull();
        await fireEvent.click(button);
        expect(response).toHaveBeenCalledWith(expect.objectContaining({ detail: { fields: {} } }));
    });

    it("keeps field focus and Escape cancellation for ordinary input", async () => {
        let { default: InputDialog } = await import("./InputDialog.svelte");
        let response = vi.fn();
        let { getByRole } = render(InputDialog, {
            props: { title: "Name", detail: "", fields: [{ label: "Bookmark", choices: [] }] },
            events: { response },
        });
        expect(document.activeElement).toBe(getByRole("textbox", { name: /Bookmark/ }));
        await fireEvent.keyDown(document, { key: "Escape" });
        expect(response).toHaveBeenCalledWith(expect.objectContaining({ detail: null }));
    });
});
