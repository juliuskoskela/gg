import "../global.css";
import "../display/palettes.css";
import { page } from "vitest/browser";
import { beforeAll } from "vitest";
beforeAll(async () => { await page.viewport(1280, 720); });
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/svelte";
import DetailHeader from "./DetailHeader.svelte";
import { mountShell } from "../controls/test/shell";
import { beforeEach } from "vitest";
let shell: HTMLDivElement;
beforeEach(() => { shell = mountShell(); });

afterEach(cleanup);

describe("detail header", () => {
    it("shows the title with a status row of pills", () => {
        let { getByRole, getAllByRole } = render(DetailHeader, { target: shell, props: { title: "describe commit abc", pills: [{ label: "Latest" }, { label: "Read only", tone: "muted" }] } });
        expect(getByRole("heading", { level: 2 }).textContent).toBe("describe commit abc");
        let pills = getAllByRole("listitem");
        expect(pills.map(pill => pill.textContent)).toEqual(["Latest", "Read only"]);
        let a = pills[0].getBoundingClientRect(), b = pills[1].getBoundingClientRect();
        expect(Math.abs(a.top - b.top)).toBeLessThan(1);
        expect(b.left - a.right).toBe(4);
        expect(getComputedStyle(pills[1].querySelector(".badge")!).color).not.toBe(getComputedStyle(pills[0].querySelector(".badge")!).color);
    });
    it("omits the status row without pills", () => {
        let { container } = render(DetailHeader, { target: shell, props: { title: "Only a title" } });
        expect(container.querySelector(".status")).toBeNull();
    });
});
