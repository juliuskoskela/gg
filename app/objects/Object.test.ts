import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/svelte";
import { cleanupMocks, setupMocks } from "../mocks";
import type { Operand } from "../messages/Operand";
import Object from "./Object.svelte";

describe("repository object callbacks", () => {
    beforeEach(() => setupMocks());
    afterEach(async () => cleanupMocks());

    it("passes the native event to callbacks and updates reused object identities", async () => {
        let onClick = vi.fn(), onDoubleClick = vi.fn();
        let operand: Operand = { type: "Workspace", name: "one" };
        let view = render(Object, { operand, suffix: "one", label: "One", conflicted: false, onClick, onDoubleClick });
        let button = view.getByRole("option");
        await fireEvent.click(button, { ctrlKey: true });
        expect(onClick).toHaveBeenCalledOnce();
        expect(onClick.mock.calls[0][0]).toBeInstanceOf(MouseEvent);
        expect(onClick.mock.calls[0][0].ctrlKey).toBe(true);
        await fireEvent.doubleClick(button);
        expect(onDoubleClick).toHaveBeenCalledOnce();
        expect(onDoubleClick.mock.calls[0][0]).toBeInstanceOf(MouseEvent);
        await view.rerender({ operand: { type: "Repository" }, suffix: "two", label: "Two", conflicted: false, onClick, onDoubleClick });
        expect(view.getByRole("option")).toBe(button);
        expect(button.id).toBe("Repository-two");
        expect(button.getAttribute("aria-label")).toBe("Two");
    });
});
