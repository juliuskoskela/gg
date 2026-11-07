import "../global.css";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/svelte";
import { page, userEvent } from "vitest/browser";
import IdSpan from "./IdSpan.svelte";
import type { CommitId } from "../messages/CommitId";
import { setupMocks, cleanupMocks } from "../mocks";

let commit: CommitId = { type: "CommitId", hex: "5961122209ed8939afc0093e34c9376bae8d43ef", prefix: "596", rest: "1122209ed8939afc0093e34c9376bae8d43ef" };
let shell: HTMLDivElement;

describe("full revision ID tooltips", () => {
    beforeEach(async () => {
        await page.viewport(1280, 720);
        setupMocks();
        shell = document.createElement("div");
        shell.id = "shell";
        shell.className = "dark";
        shell.style.cssText = "padding:24px;background:var(--surface);color:var(--text);min-height:240px";
        document.body.append(shell);
    });
    afterEach(async () => { cleanup(); shell.remove(); await page.viewport(1280, 720); await cleanupMocks(); });

    it.each(["light", "dark"])("shows the full hash and its meaning on hover in the %s palette", async theme => {
        shell.className = theme;
        render(IdSpan, { target: shell, props: { id: commit, selectable: true } });
        let trigger = shell.querySelector<HTMLElement>(".id")!;
        expect(trigger.textContent).toBe("59611222");
        await page.elementLocator(trigger).hover();
        let tip = await waitFor(() => {
            let tip = document.querySelector<HTMLElement>('[role="tooltip"]');
            expect(tip).not.toBeNull();
            return tip!;
        });
        expect(tip.textContent).toContain(commit.hex);
        expect(tip.textContent).toContain("Changes when rewritten");
        expect(trigger.getAttribute("title")).toBe("");
        expect(trigger.getAttribute("aria-describedby")).toBe(tip.id);
        expect(getComputedStyle(tip).backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
        expect(getComputedStyle(tip).fontFamily).toContain("IBM Plex Sans");
        await document.fonts.ready;
        await page.screenshot({ path: `../../.taste-skill/revision-ids/tooltip-${theme}.png`, element: shell });
        await fireEvent.mouseLeave(trigger);
        await fireEvent.mouseEnter(tip);
        await new Promise(resolve => setTimeout(resolve, 160));
        expect(tip.isConnected).toBe(true);
        await userEvent.keyboard("{Escape}");
        expect(document.querySelector('[role="tooltip"]')).toBeNull();
        expect(trigger.hasAttribute("aria-describedby")).toBe(false);
    });

    it("explains divergent change IDs on keyboard focus", async () => {
        let hex = "ztxrwlzloqszlyqmvrklvozlrxkntvys";
        render(IdSpan, { target: shell, props: { selectable: true, id: { type: "ChangeId", hex, prefix: "ztx", rest: hex.slice(3), offset: 1, is_divergent: true } } });
        shell.querySelector<HTMLElement>(".id")!.focus();
        let tip = document.querySelector<HTMLElement>('[role="tooltip"]')!;
        expect(tip.textContent).toContain(hex);
        expect(tip.textContent).toContain("Divergent change ID");
        expect(tip.textContent).toContain("/1");
        await userEvent.keyboard("{Tab}");
        expect(document.querySelector('[role="tooltip"]')).toBeNull();
    });

    it("fits a full SHA-256 hash beside the viewport edge at 320px", async () => {
        await page.viewport(320, 480);
        shell.style.textAlign = "right";
        render(IdSpan, { target: shell, props: { selectable: true, id: { ...commit, hex: "a".repeat(64) } } });
        await page.elementLocator(shell.querySelector<HTMLElement>(".id")!).hover();
        let tip = await waitFor(() => {
            let tip = document.querySelector<HTMLElement>('[role="tooltip"]');
            expect(tip).not.toBeNull();
            return tip!;
        });
        let bounds = tip.getBoundingClientRect();
        expect(bounds.left).toBeGreaterThanOrEqual(8);
        expect(bounds.right).toBeLessThanOrEqual(312);
        expect(tip.scrollWidth).toBeLessThanOrEqual(tip.clientWidth);
        expect(getComputedStyle(tip).fontFamily).toContain("IBM Plex Sans");
        await document.fonts.ready;
        await page.screenshot({ path: "../../.taste-skill/revision-ids/tooltip-narrow.png" });
    });

    it("clears old tooltip content when a virtualized slot receives another revision", async () => {
        let view = render(IdSpan, { target: shell, props: { id: commit, selectable: true } });
        shell.querySelector<HTMLElement>(".id")!.focus();
        expect(document.querySelector('[role="tooltip"]')?.textContent).toContain(commit.hex);
        await view.rerender({ id: { ...commit, hex: "b".repeat(40) }, selectable: true });
        expect(document.querySelector('[role="tooltip"]')).toBeNull();
        await fireEvent.focusIn(shell.querySelector<HTMLElement>(".id")!);
        expect(document.querySelector('[role="tooltip"]')?.textContent).toContain("b".repeat(40));
        view.unmount();
        expect(document.querySelector('[role="tooltip"]')).toBeNull();
    });
});
