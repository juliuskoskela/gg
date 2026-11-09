import "../global.css";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/svelte";
import { userEvent } from "vitest/browser";
import { menuBehavior, menuPosition } from "./menu";
import OptionsMenu from "./OptionsMenu.svelte";
import ViewsMenu from "../shell/ViewsMenu.svelte";

let fixtureRoot: HTMLDivElement | undefined;
let dispose: (() => void) | undefined;
afterEach(() => { dispose?.(); dispose = undefined; cleanup(); fixtureRoot?.remove(); fixtureRoot = undefined; });

describe("shared menu interaction", () => {
    function fixture() {
        let trigger = document.createElement("button");
        trigger.textContent = "Open";
        let menu = document.createElement("div");
        menu.tabIndex = -1;
        menu.innerHTML = '<button role="menuitem" tabindex="-1">Alpha</button><button role="menuitem" disabled>Blocked</button><button role="menuitemcheckbox" tabindex="-1">Beta</button><button role="menuitem" tabindex="-1">Bravo</button>';
        fixtureRoot = document.createElement("div");
        fixtureRoot.append(trigger, menu);
        document.body.append(fixtureRoot);
        trigger.focus();
        let onClose = vi.fn();
        let controller = menuBehavior(menu, { onClose, returnFocus: trigger, initialFocus: "menu" });
        dispose = controller.destroy;
        return { trigger, menu, onClose, buttons: menu.querySelectorAll("button"), controller };
    }

    it("wraps in both directions, skips disabled actions and supports type selection", async () => {
        let { buttons } = fixture();
        await userEvent.keyboard("{ArrowUp}");
        expect(document.activeElement).toBe(buttons[3]);
        await userEvent.keyboard("{ArrowDown}");
        expect(document.activeElement).toBe(buttons[0]);
        await userEvent.keyboard("{ArrowDown}");
        expect(document.activeElement).toBe(buttons[2]);
        await userEvent.keyboard("b");
        expect(document.activeElement).toBe(buttons[3]);
        await userEvent.keyboard("{Home}");
        expect(document.activeElement).toBe(buttons[0]);
        await userEvent.keyboard("{End}");
        expect(document.activeElement).toBe(buttons[3]);
    });

    it("closes on Escape and restores the opener", async () => {
        let { trigger, onClose } = fixture();
        await userEvent.keyboard("{ArrowDown}{Escape}");
        expect(onClose).toHaveBeenCalledOnce();
        expect(document.activeElement).toBe(trigger);
    });

    it("lets Tab leave naturally and removes listeners on disposal", () => {
        let { menu, onClose, controller } = fixture();
        let tab = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
        menu.dispatchEvent(tab);
        expect(tab.defaultPrevented).toBe(false);
        expect(onClose).toHaveBeenCalledOnce();
        controller.destroy();
        dispose = undefined;
        menu.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        expect(onClose).toHaveBeenCalledOnce();
    });

    it("keeps the whole menu within the viewport for each placement", () => {
        for (let placement of ["pointer", "above-end", "below-end"] as const) {
            expect(menuPosition({ x: 390, y: 844 }, { width: 180, height: 200 }, placement, { width: 390, height: 844 }))
                .toEqual({ left: 202, top: 636 });
        }
    });

    it("uses the same navigation in the options disclosure", async () => {
        let toggle = vi.fn();
        let { getByRole, queryByRole } = render(OptionsMenu, { props: { label: "Display", icon: "sliders", options: [
            { id: "alpha", label: "Alpha", checked: false, onToggle: toggle },
            { id: "beta", label: "Beta", checked: true, onToggle: toggle },
        ] } });
        let opener = getByRole("button", { name: "Display" });
        opener.click();
        await vi.waitFor(() => expect(document.activeElement).toBe(getByRole("menu")));
        await userEvent.keyboard("{ArrowUp}{Enter}");
        expect(toggle).toHaveBeenCalledOnce();
        expect(document.activeElement).toBe(getByRole("menuitemcheckbox", { name: "Beta" }));
        await userEvent.keyboard("{Escape}");
        expect(queryByRole("menu")).toBeNull();
        expect(document.activeElement).toBe(opener);
    });

    it("keeps a long options menu reachable at the bottom of the viewport", async () => {
        let { container, getByRole } = render(OptionsMenu, { props: { label: "Long menu", icon: "sliders", options: Array.from({ length: 80 }, (_, index) => ({
            id: String(index), label: `Option ${index}`, checked: false, onToggle: () => {},
        })) } });
        container.style.cssText = "position:fixed;bottom:0;right:0";
        getByRole("button", { name: "Long menu" }).click();
        await vi.waitFor(() => {
            let menu = getByRole("menu");
            let bounds = menu.getBoundingClientRect();
            expect(bounds.top).toBeGreaterThanOrEqual(8);
            expect(bounds.bottom).toBeLessThanOrEqual(window.innerHeight - 7);
            expect(menu.scrollHeight).toBeGreaterThan(menu.clientHeight);
        });
        await userEvent.keyboard("{End}");
        expect(document.activeElement).toBe(getByRole("menuitemcheckbox", { name: "Option 79" }));
    });

    it("moves keyboard focus into the Views menu and returns it on Escape", async () => {
        let { getByRole, queryByRole } = render(ViewsMenu);
        let opener = getByRole("button", { name: "Views" });
        opener.focus();
        await userEvent.keyboard("{Enter}");
        await vi.waitFor(() => expect(document.activeElement).toBe(getByRole("menu")));
        await userEvent.keyboard("{End}");
        expect(document.activeElement).toBe(getByRole("menuitem", { name: "Reset layout" }));
        await userEvent.keyboard("{Escape}");
        expect(queryByRole("menu")).toBeNull();
        expect(document.activeElement).toBe(opener);
    });
});
