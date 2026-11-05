import type { RevHeader } from "../messages/RevHeader";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render, cleanup } from "@testing-library/svelte";
import { cleanupMocks, setupMocks } from "../mocks";
import "../global.css";

let shell: HTMLDivElement;
describe("shared rendered controls", () => {
    beforeEach(() => { setupMocks(); shell = document.createElement("div"); shell.id = "shell"; shell.className = "light"; document.body.append(shell); });
    afterEach(async () => { cleanup(); shell.remove(); await cleanupMocks(); });
    it("renders divergence as a symbol in addition to color", async () => {
        let { default: IdSpan } = await import("./IdSpan.svelte");
        let { container } = render(IdSpan, { target: shell, props: { id: { type: "ChangeId", hex: "abcdefgh", prefix: "abc", rest: "defgh", offset: null, is_divergent: true } } });
        expect(container.textContent).toContain("≠");
        expect(shell.querySelector('[aria-label="Divergent change"]')).not.toBeNull();
    });
    it("retains centered graph geometry and conflict identity when selected", async () => {
        let { default: RevisionObject } = await import("../objects/RevisionObject.svelte");
        let header: RevHeader = { id: { change: { type: "ChangeId", hex: "abcdefgh", prefix: "abc", rest: "defgh", offset: null, is_divergent: true }, commit: { type: "CommitId", hex: "12345678", prefix: "123", rest: "45678" } }, description: { lines: ["Resolve this very long description without changing row geometry"] }, author: { name: "Long Author", email: "author@example.com", timestamp: "2026-01-01T00:00:00Z" }, has_conflict: true, is_immutable: true, is_working_copy: true, working_copy_of: null, refs: [], parent_ids: [] };
        let { getByRole } = render(RevisionObject, { target: shell, props: { header: structuredClone(header), selected: true } });
        shell.style.setProperty("--leftpad", "24px");
        shell.style.width = "390px";
        let option = getByRole("option");
        expect(option.getAttribute("aria-label")).toContain("Unresolved conflict; Divergent change; Working copy; Immutable revision");
        expect(option.getBoundingClientRect().height).toBe(28);
        let row = option.querySelector(".layout")!;
        let desc = option.querySelector(".desc")!;
        let rowRect = row.getBoundingClientRect();
        let descRect = desc.getBoundingClientRect();
        expect(Math.abs((rowRect.top + rowRect.height / 2) - (descRect.top + descRect.height / 2))).toBeLessThanOrEqual(2);
        expect(option.querySelector(".status-icon svg")).not.toBeNull();
        expect(option.textContent).not.toContain("Long Author");
        expect(option.scrollWidth).toBeLessThanOrEqual(390);
    });
    it("measures semantic text, control edges and focus against both theme surfaces", () => {
        let sample = document.createElement("span");
        shell.append(sample);
        let canvas = document.createElement("canvas");
        canvas.width = canvas.height = 1;
        let context = canvas.getContext("2d")!;
        function luminance(color: string) {
            context.fillStyle = color;
            context.fillRect(0, 0, 1, 1);
            let channels = [...context.getImageData(0, 0, 1, 1).data].slice(0, 3).map(value => { let channel = value / 255; return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4; });
            return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
        }
        for (let theme of ["light", "dark"]) {
            shell.className = theme;
            for (let backgroundRole of ["surface", "selection-bg"]) {
            for (let role of ["text", "muted", "positive", "negative", "warning", "focus-ring", "control-border"]) {
                sample.style.cssText = `color: var(--${role}); background: var(--${backgroundRole})`;
                let style = getComputedStyle(sample);
                let foreground = luminance(style.color);
                let background = luminance(style.backgroundColor);
                let ratio = (Math.max(foreground, background) + .05) / (Math.min(foreground, background) + .05);
                expect(ratio, `${theme} ${role} on ${backgroundRole}: ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(role === "focus-ring" || role === "control-border" ? 3 : 4.5);
            }
            }
        }
    });
    it("uses token focus geometry and preserves disabled controls", async () => {
        let { default: PanelToggle } = await import("./PanelToggle.svelte");
        let { getByRole } = render(PanelToggle, { target: shell, props: { label: "Files", expanded: false, onToggle: () => {}, disabled: true, stacked: true } });
        let button = getByRole("button", { name: "Files" }) as HTMLButtonElement;
        expect(button.disabled).toBe(true);
        expect(button.type).toBe("button");
        expect(parseFloat(getComputedStyle(button).minHeight)).toBeGreaterThanOrEqual(window.matchMedia("(pointer: coarse), (max-width: 600px)").matches ? 44 : 32);
        expect(button.getAttribute("aria-expanded")).toBe("false");
        shell.className = "dark";
        expect(getComputedStyle(button).color).not.toBe("");
    });
});
