import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/svelte";
import FieldHarness from "./test/FieldHarness.svelte";
import TextField from "./TextField.svelte";

// component bindings must preserve native typing and imperative focus for panels.
describe("shared text fields", () => {
    afterEach(cleanup);

    for (let multiline of [false, true]) {
        it(`preserves native bindings and events for ${multiline ? "multiline" : "single-line"} fields`, async () => {
            let events: string[] = [];
            let { getByRole } = render(FieldHarness, { props: { multiline, onEvent: (event: Event) => events.push(event.type) } });
            let field = getByRole(multiline ? "textbox" : "searchbox", { name: multiline ? "Description" : "Find a file" }) as HTMLInputElement | HTMLTextAreaElement;
            expect(field.classList.contains(multiline ? "description-field" : "search-field")).toBe(true);
            expect(field.value).toBe("Initial text");
            if (multiline) expect(field.getAttribute("rows")).toBe("4");
            await fireEvent.input(field, { target: { value: "Typed text" } });
            expect(getByRole("status", { name: "Bound value" }).textContent).toBe("Typed text");
            await fireEvent.click(getByRole("button", { name: "Replace value" }));
            expect(field.value).toBe("Updated text");
            await fireEvent.click(getByRole("button", { name: "Focus field" }));
            expect(document.activeElement).toBe(field);
            await fireEvent.keyDown(field, { key: "Escape" });
            await fireEvent.change(field);
            await fireEvent.dragEnter(field);
            await fireEvent.dragOver(field);
            field.blur();
            expect(events).toEqual(expect.arrayContaining(["input", "focus", "keydown", "change", "dragenter", "dragover", "blur"]));
        });
    }

    it("passes through native accessibility and disabled attributes", () => {
        let { getByRole } = render(TextField, { props: { "aria-label": "Filter revisions", disabled: true, placeholder: "Search revisions" } });
        let field = getByRole("textbox", { name: "Filter revisions" }) as HTMLInputElement;
        expect(field.disabled).toBe(true);
        expect(field.placeholder).toBe("Search revisions");
    });
});
