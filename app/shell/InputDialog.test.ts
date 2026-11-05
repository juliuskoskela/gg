import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/svelte";
import InputDialog from "./InputDialog.svelte";
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

describe("input dialog keyboard behavior", () => {
    it("does not submit when Enter is pressed on Cancel and restores focus", async () => {
        let trigger = document.createElement("button");
        document.body.append(trigger);
        trigger.focus();
        let response = vi.fn();
        let view = render(InputDialog, { props: { title: "Input", detail: "", fields: [{ label: "Name", choices: [] }] }, events: { response } });
        let cancel = view.getByRole("button", { name: "Cancel" });
        cancel.focus();
        await fireEvent.keyDown(cancel, { key: "Enter" });
        expect(response).not.toHaveBeenCalled();
        await fireEvent.click(cancel);
        expect(response).toHaveBeenCalledOnce();
        expect(response.mock.calls[0][0].detail).toBeNull();
        view.unmount();
        expect(document.activeElement).toBe(trigger);
        trigger.remove();
    });

    it("does not submit an input while composing or after a handled key", async () => {
        let response = vi.fn();
        let view = render(InputDialog, {
            props: { title: "Input", detail: "", fields: [{ label: "Name", choices: [] }] },
            events: { response },
        });
        let input = view.getByRole("textbox", { name: /Name/ });
        await fireEvent.keyDown(input, { key: "Enter", isComposing: true });
        let handled = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
        handled.preventDefault();
        input.dispatchEvent(handled);
        expect(response).not.toHaveBeenCalled();
        await fireEvent.keyDown(input, { key: "Enter" });
        expect(response).toHaveBeenCalledOnce();
        view.unmount();
    });

    it("keeps keyboard focus inside the dialog", async () => {
        let view = render(InputDialog, { props: { title: "Input", detail: "", fields: [{ label: "Name", choices: [] }] } });
        let input = view.getByLabelText("Name:");
        let enter = view.getByRole("button", { name: "Enter" });
        enter.focus();
        await fireEvent.keyDown(enter, { key: "Tab" });
        expect(document.activeElement).toBe(input);
        await fireEvent.keyDown(input, { key: "Tab", shiftKey: true });
        expect(document.activeElement).toBe(enter);
        view.unmount();
    });
});
