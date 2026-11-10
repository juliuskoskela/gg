import "../global.css";
import "../display/palettes.css";
import { page } from "vitest/browser";
import { beforeAll } from "vitest";
beforeAll(async () => { await page.viewport(1280, 720); });
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/svelte";
import { createRawSnippet } from "svelte";
import SectionHeading from "./SectionHeading.svelte";
import Badge from "./Badge.svelte";
import { mountShell } from "./test/shell";
let shell: HTMLDivElement;
beforeEach(() => { shell = mountShell(); });

afterEach(cleanup);

describe("section heading", () => {
    it("is an h3 with a tabular count and uses the heading role and group gap", () => {
        let { getByRole, container } = render(SectionHeading, { target: shell, props: { title: "Bookmarks", count: 3 } });
        let heading = getByRole("heading", { level: 3, name: "Bookmarks" });
        let style = getComputedStyle(heading);
        expect(style.fontWeight).toBe("600");
        expect(style.marginTop).toBe("0px");
        let root = container.querySelector<HTMLElement>(".section-heading")!;
        expect(getComputedStyle(root).marginBottom).toBe(getComputedStyle(document.documentElement).getPropertyValue("--gap-group").trim());
        let count = container.querySelector<HTMLElement>(".count")!;
        expect(count.textContent).toBe("3");
        expect(getComputedStyle(count).fontVariantNumeric).toContain("tabular-nums");
        expect(getComputedStyle(root).columnGap).toBe("8px");
    });
    it("renders no count when none is given and puts actions at the trailing edge", () => {
        let actions = createRawSnippet(() => ({ render: () => `<button type="button">Act</button>` }));
        let { container } = render(SectionHeading, { target: shell, props: { title: "Patch", actions } });
        expect(container.querySelector(".count")).toBeNull();
        let button = container.querySelector("button")!.getBoundingClientRect();
        let root = container.querySelector<HTMLElement>(".section-heading")!.getBoundingClientRect();
        expect(Math.abs(root.right - button.right)).toBeLessThan(1);
    });
});

describe("badge", () => {
    it("renders its tones as quiet pills", async () => {
        let label = createRawSnippet(() => ({ render: () => `<span>Latest</span>` }));
        let { container, rerender } = render(Badge, { target: shell, props: { children: label } });
        let badge = container.querySelector<HTMLElement>(".badge")!;
        expect(badge.textContent).toBe("Latest");
        expect(getComputedStyle(badge).backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
        let solid = getComputedStyle(badge).color;
        await rerender({ tone: "muted", children: label });
        expect(badge.classList.contains("muted")).toBe(true);
        expect(getComputedStyle(badge).backgroundColor).toBe("rgba(0, 0, 0, 0)");
        expect(getComputedStyle(badge).color).not.toBe(solid);
    });
});
