import "../global.css";
import "../display/palettes.css";
import { page } from "vitest/browser";
import { beforeAll } from "vitest";
beforeAll(async () => { await page.viewport(1280, 720); });
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

describe("entry kinds", () => {
    it("leads the line with a labelled icon and keeps rows one line tall", () => {
        let rows = [
            { id: "a", title: "Describe it", kind: { icon: "edit-3", tone: "rewrite" as const, label: "Rewritten" } },
            { id: "b", title: "Plain entry" },
        ];
        let { container, getByRole } = render(LogList, { props: { label: "History", rows, onSelect: () => {} } });
        let icon = container.querySelector<HTMLElement>(".kind")!;
        expect(icon.getAttribute("aria-label")).toBe("Rewritten");
        expect(icon.title).toBe("Rewritten");
        expect(icon.getBoundingClientRect().width).toBe(16);
        expect(container.querySelectorAll(".kind").length).toBe(1);
        expect(getByRole("button", { name: /Rewritten Describe it/ })).toBeTruthy();
        let heights = [...container.querySelectorAll("button")].map(button => button.getBoundingClientRect().height);
        expect(new Set(heights).size).toBe(1);
        expect(heights[0]).toBe(28);
    });
});
