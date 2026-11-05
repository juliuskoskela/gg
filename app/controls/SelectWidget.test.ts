import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/svelte";
import SelectWidget from "./SelectWidget.svelte";

// the native select retains selection and accessibility while its chrome is shared.
describe("shared select", () => {
    afterEach(cleanup);

    it("keeps a named native select with an unobstructed shared chevron", async () => {
        let { getByRole, container, rerender } = render(SelectWidget, {
            props: { label: "Git remote", title: "Choose Git remote", options: [{ value: "origin" }, { value: "upstream" }], value: "origin" },
        });
        let select = getByRole("combobox", { name: "Git remote" }) as HTMLSelectElement;
        expect(select.title).toBe("Choose Git remote");
        expect(select.value).toBe("origin");
        await fireEvent.change(select, { target: { value: "upstream" } });
        expect(select.value).toBe("upstream");
        let chevron = container.querySelector<HTMLElement>(".select-chevron")!;
        expect(chevron.getAttribute("aria-hidden")).toBe("true");
        expect(getComputedStyle(chevron).pointerEvents).toBe("none");
        expect(container.querySelector("use")?.getAttribute("href")).toContain("#chevron-down");
        await rerender({ value: "origin", disabled: true });
        expect(select.value).toBe("origin");
        expect(select.disabled).toBe(true);
    });

    it("keeps separators out of the selectable options", () => {
        let { getAllByRole } = render(SelectWidget, { props: {
            options: [{ value: "all()" }, { value: "", separator: true }, { value: "mine()" }], value: "all()",
        } });
        expect(getAllByRole("option").map(option => option.textContent?.trim())).toEqual(["all()", "mine()"]);
    });
});
