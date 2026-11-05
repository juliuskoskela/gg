import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render } from "@testing-library/svelte";
import { cleanupMocks, setupMocks } from "../mocks";

describe("protection toggle", () => {
    beforeEach(() => setupMocks());
    afterEach(async () => {
        let { hasModal } = await import("../stores");
        hasModal.set(false);
        await cleanupMocks();
    });

    it("disables repository toggles while a modal is open", async () => {
        let { default: ToggleWidget } = await import("./ToggleWidget.svelte");
        let { hasModal } = await import("../stores");
        hasModal.set(true);
        let { getByRole } = render(ToggleWidget, {
            props: { checked: false, on: "shield-off", off: "shield", tip: "Revision protection" },
        });
        let button = getByRole("button", { name: "Revision protection" }) as HTMLButtonElement;
        expect(button.disabled).toBe(true);
        await fireEvent.click(button);
        expect(button.getAttribute("aria-pressed")).toBe("false");
    });

    it("exposes the pressed state when an enabled toggle changes", async () => {
        let { default: ToggleWidget } = await import("./ToggleWidget.svelte");
        let { getByRole } = render(ToggleWidget, {
            props: { checked: false, on: "shield-off", off: "shield", tip: "Revision protection" },
        });
        let button = getByRole("button", { name: "Revision protection" });
        await fireEvent.click(button);
        expect(button.getAttribute("aria-pressed")).toBe("true");
    });
});
