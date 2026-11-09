import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/svelte";
import { userEvent } from "vitest/browser";
import LogList from "./LogList.svelte";

afterEach(cleanup);

describe("history list navigation", () => {
    it("moves focus and selection together while leaving activation to the list", async () => {
        let onSelect = vi.fn();
        let { getByRole } = render(LogList, { props: {
            label: "History", rows: [{ id: "a", title: "First" }, { id: "b", title: "Second" }, { id: "c", title: "Last" }], onSelect,
        } });
        getByRole("button", { name: "First" }).focus();
        await userEvent.keyboard("{ArrowDown}");
        expect(document.activeElement).toBe(getByRole("button", { name: "Second" }));
        expect(onSelect).toHaveBeenLastCalledWith("b");
        await userEvent.keyboard("{End}");
        expect(document.activeElement).toBe(getByRole("button", { name: "Last" }));
        expect(onSelect).toHaveBeenLastCalledWith("c");
        await userEvent.keyboard("{Home}");
        expect(document.activeElement).toBe(getByRole("button", { name: "First" }));
        expect(onSelect).toHaveBeenLastCalledWith("a");
    });
});
