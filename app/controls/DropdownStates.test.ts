import "../global.css";
import { cdp, page, userEvent } from "vitest/browser";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/svelte";
import SelectWidget from "./SelectWidget.svelte";

let shell: HTMLDivElement;
afterEach(async () => { await userEvent.keyboard("{Escape}"); cleanup(); shell?.remove(); await page.viewport(1280, 720); });

function pixels(color: string, background: string) {
    let context = document.createElement("canvas").getContext("2d")!;
    context.fillStyle = background; context.fillRect(0, 0, 1, 1);
    context.fillStyle = color; context.fillRect(0, 0, 1, 1);
    return [...context.getImageData(0, 0, 1, 1).data].slice(0, 3);
}
function luminance(rgb: number[]) {
    let channels = rgb.map(value => { let c = value / 255; return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; });
    return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
}
function contrast(foreground: number[], background: number[]) {
    let a = luminance(foreground), b = luminance(background);
    return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
}
function distance(a: number[], b: number[]) { return Math.max(...a.map((value, index) => Math.abs(value - b[index]))); }

// measure the rendered options, including their transparent fill on the actual picker surface.
describe("dropdown interaction feedback", () => {
    for (let theme of ["light", "dark", "custom"]) {
        for (let width of [1280, 390]) {
            it(`distinguishes hover, selection and press without fading labels: ${theme}, ${width}px`, async () => {
                await page.viewport(width, 844);
                shell = document.createElement("div"); shell.id = "shell"; shell.className = theme === "custom" ? "dark" : theme;
                shell.style.cssText = "padding:24px;width:100%;height:100%;background:var(--surface);color:var(--text)";
                if (theme === "custom") shell.style.cssText += ";--text:#e4e0d4;--text-strong:#f5f1e6;--popover-surface:#32342f;--surface:#272923";
                document.body.append(shell);
                let { getByRole } = render(SelectWidget, { target: shell, props: { label: "Git remote", options: [{ value: "origin" }, { value: "upstream" }, { value: "unavailable", disabled: true }], value: "origin" } });
                let select = getByRole("combobox") as HTMLSelectElement;
                await page.getByRole("combobox", { name: "Git remote" }).click();
                expect(select.matches(":open")).toBe(true);
                let origin = getByRole("option", { name: "origin" }) as HTMLOptionElement;
                let upstream = getByRole("option", { name: "upstream" }) as HTMLOptionElement;
                let unavailable = getByRole("option", { name: "unavailable" }) as HTMLOptionElement;
                let surface = getComputedStyle(select, "::picker(select)").backgroundColor;
                function state(option: HTMLOptionElement) {
                    let style = getComputedStyle(option);
                    let background = pixels(style.backgroundColor, surface);
                    expect(contrast(pixels(style.color, surface), background)).toBeGreaterThanOrEqual(4.5);
                    expect(style.opacity).toBe("1");
                    return background;
                }
                await page.getByRole("option", { name: "unavailable" }).hover({ force: true });
                let resting = state(upstream), selected = state(origin);
                let disabledFill = getComputedStyle(unavailable).backgroundColor;
                expect(unavailable.disabled).toBe(true);
                expect(distance(selected, resting)).toBeGreaterThanOrEqual(18);
                await page.getByRole("option", { name: "upstream" }).hover();
                let hovered = state(upstream);
                expect(distance(hovered, resting)).toBeGreaterThanOrEqual(14);
                await page.getByRole("option", { name: "origin" }).hover();
                let selectedHover = state(origin);
                expect(distance(selectedHover, selected)).toBeGreaterThanOrEqual(12);
                let box = origin.getBoundingClientRect();
                let protocol = cdp() as unknown as { send(command: string, parameters: object): Promise<void> };
                await protocol.send("Input.dispatchMouseEvent", { type: "mousePressed", x: box.x + 12, y: box.y + box.height / 2, button: "left", clickCount: 1 });
                let pressed = state(origin);
                expect(distance(pressed, selectedHover)).toBeGreaterThanOrEqual(5);
                await protocol.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: box.x + 12, y: box.y + box.height / 2, button: "left", clickCount: 1 });
                await page.getByRole("combobox", { name: "Git remote" }).click();
                await page.getByRole("option", { name: "unavailable" }).hover({ force: true });
                expect(getComputedStyle(unavailable).backgroundColor).toBe(disabledFill);
                await userEvent.keyboard("{Escape}");
                select.focus();
                await userEvent.keyboard("{ArrowDown}{ArrowDown}{Enter}");
                expect(select.value).toBe("upstream");
            });
        }
    }
});
