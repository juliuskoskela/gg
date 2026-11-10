import "../global.css";
import "../display/palettes.css";
import { page } from "vitest/browser";
import { beforeAll } from "vitest";
beforeAll(async () => { await page.viewport(1280, 720); });
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/svelte";
import { userEvent } from "vitest/browser";
import { cleanupMocks, setupMocks } from "../mocks";
import RefLine from "./RefLine.svelte";
import { mountShell } from "../controls/test/shell";

beforeEach(() => setupMocks());
afterEach(async () => { cleanup(); await cleanupMocks(); });

describe("reference lines", () => {
    it("keeps every line the same height with the chip leading and ids trailing", () => {
        let host = mountShell(420);
        let rows = [
            { kind: "workspace" as const, name: "default", ids: ["a1b2c3d4e5f6a7b8"] },
            { kind: "bookmark" as const, name: "main", ids: ["b2c3d4e5f6a7b8c9"], removed: ["d4e5f6a7b8c9d0e1"] },
            { kind: "bookmark" as const, name: "release", ids: ["c3d4e5f6a7b8c9d0"], conflicted: true },
        ];
        for (let props of rows) render(RefLine, { target: host, props: { ...props, onInspect: () => {} } });
        let lines = [...host.querySelectorAll<HTMLElement>(".ref-line")];
        let heights = lines.map(line => line.getBoundingClientRect().height);
        expect(heights).toEqual([28, 28, 28]);
        for (let line of lines) {
            let box = line.getBoundingClientRect();
            let chip = line.querySelector(".chip")!.getBoundingClientRect();
            let trail = line.querySelector(".trail")!.getBoundingClientRect();
            expect(chip.left).toBe(box.left);
            expect(Math.abs(trail.right - box.right)).toBeLessThan(1);
            // chip and ids are centred on the same line
            expect(Math.abs((chip.top + chip.bottom) / 2 - (box.top + box.bottom) / 2)).toBeLessThan(1);
        }
        let conflicted = lines[2].querySelector<HTMLElement>(".conflicted")!;
        expect(conflicted.textContent).toBe("Conflicted");
        let probe = document.createElement("span");
        probe.style.color = "var(--warning)";
        host.append(probe);
        expect(getComputedStyle(conflicted).color).toBe(getComputedStyle(probe).color);
        let removed = lines[1].querySelector<HTMLElement>(".removed")!;
        expect(getComputedStyle(removed).textDecorationLine).toBe("line-through");
    });
    it("opens available ids and shows unavailable ones as plain text", async () => {
        let onInspect = vi.fn();
        let { getByRole, container } = render(RefLine, { target: mountShell(), props: { kind: "bookmark", name: "main", ids: ["a1b2c3d4e5f6", "ffffffffffff"], available: (id: string) => id.startsWith("a"), onInspect } });
        await userEvent.click(getByRole("button", { name: "a1b2c3d4" }));
        expect(onInspect).toHaveBeenCalledWith("a1b2c3d4e5f6");
        expect(container.querySelectorAll("button").length).toBe(1);
        expect(container.querySelector(".unavailable")!.textContent).toBe("ffffffff");
    });
});
