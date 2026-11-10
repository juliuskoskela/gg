import { describe, expect, it } from "vitest";
import { get } from "svelte/store";
import { clampHeight, createFilesDrawer, DEFAULT_HEIGHT, maxHeight, MIN_HEIGHT, shouldClose } from "./filesDrawer";

function memory(initial?: string) {
    let data = new Map<string, string>();
    if (initial !== undefined) data.set("gg.diff.files", initial);
    return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
}

describe("files drawer state", () => {
    it("clamps between the minimum and 70% of the view", () => {
        expect(maxHeight(1000)).toBe(700);
        expect(maxHeight(100)).toBe(MIN_HEIGHT);
        expect(clampHeight(10, 1000)).toBe(MIN_HEIGHT);
        expect(clampHeight(900, 1000)).toBe(700);
        expect(clampHeight(300, 1000)).toBe(300);
        expect(clampHeight(Number.NaN, 1000)).toBe(DEFAULT_HEIGHT);
    });

    it("closes below 60px only", () => {
        expect(shouldClose(59)).toBe(true);
        expect(shouldClose(60)).toBe(false);
    });

    it("defaults to closed at 240px", () => {
        expect(get(createFilesDrawer(memory()))).toEqual({ open: false, height: 240 });
    });

    it("persists and restores", () => {
        let storage = memory();
        let drawer = createFilesDrawer(storage);
        drawer.toggle();
        drawer.setHeight(310);
        expect(get(createFilesDrawer(storage))).toEqual({ open: true, height: 310 });
    });

    it("keeps the height while closing", () => {
        let drawer = createFilesDrawer(memory());
        drawer.setHeight(200);
        drawer.setOpen(true);
        drawer.setOpen(false);
        expect(get(drawer)).toEqual({ open: false, height: 200 });
    });

    it("ignores malformed storage", () => {
        expect(get(createFilesDrawer(memory("{nope")))).toEqual({ open: false, height: 240 });
        expect(get(createFilesDrawer(memory('{"open":"yes","height":"tall"}')))).toEqual({ open: false, height: 240 });
    });
});
