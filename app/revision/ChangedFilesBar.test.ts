import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRawSnippet } from "svelte";
import { fireEvent, render } from "@testing-library/svelte";
import { cleanupMocks, setupMocks } from "../mocks";
import { mountShell } from "../controls/test/shell";
import ChangedFilesBar from "./ChangedFilesBar.svelte";
import "../global.css";

let bar = createRawSnippet(() => ({ render: () => `<span class="file-path">bar</span>` }));

function mount(props: Record<string, unknown> = {}) {
    let onToggle = vi.fn();
    let view = render(ChangedFilesBar, { target: mountShell(600), props: { total: 3, index: 1, controls: "pane", onToggle, children: bar, ...props } });
    return { ...view, onToggle };
}

describe("changed files bar", () => {
    beforeEach(() => setupMocks());
    afterEach(async () => { await cleanupMocks(); });

    it("shows the position and a toggle named for what it will do, tied to the pane", async () => {
        let { getByRole, getByText, onToggle, rerender } = mount();
        expect(getByText("2 of 3")).toBeTruthy();
        let toggle = getByRole("button", { name: "Show changed files" });
        expect(toggle.getAttribute("aria-expanded")).toBe("false");
        expect(toggle.getAttribute("aria-controls")).toBe("pane");
        await fireEvent.click(toggle);
        expect(onToggle).toHaveBeenCalledOnce();
        await rerender({ open: true });
        expect(getByRole("button", { name: "Hide changed files" }).getAttribute("aria-expanded")).toBe("true");
    });

    it("draws the toggle with the placement icon, turned for the pane's side", async () => {
        let { getByRole, rerender } = mount();
        let glyph = () => getByRole("button", { name: "Show changed files" }).querySelector<HTMLElement>(".glyph")!;
        expect(glyph().querySelector("use")?.getAttribute("href")).toContain("#sidebar");
        expect(glyph().style.transform).toBe("rotate(-90deg)");
        await rerender({ side: "left" });
        expect(glyph().style.transform).toBe("");
        await rerender({ side: "right" });
        expect(glyph().style.transform).toBe("scaleX(-1)");
        await rerender({ side: "top" });
        expect(glyph().style.transform).toBe("rotate(90deg)");
    });

    it("is only the file's own controls without a pane", () => {
        let { queryByRole, queryByText } = mount({ pane: false });
        expect(queryByRole("button", { name: "Show changed files" })).toBeNull();
        expect(queryByText("2 of 3")).toBeNull();
    });
});
