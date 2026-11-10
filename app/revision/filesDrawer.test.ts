import { describe, expect, it } from "vitest";
import { get } from "svelte/store";
import { createFilesDrawer, DEFAULT_HEIGHT, DEFAULT_WIDTH, MIN_HEIGHT, MIN_WIDTH } from "./filesDrawer";

function memory(initial?: string) {
    let data = new Map<string, string>();
    if (initial !== undefined) data.set("gg.diff.files", initial);
    return { data, getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
}
let closed = { open: false, side: "bottom", width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT };

describe("changed files pane state", () => {
    it("defaults to closed at the bottom, 280px wide and 240px tall", () => {
        expect(get(createFilesDrawer(memory()))).toEqual(closed);
        expect(DEFAULT_WIDTH).toBe(280);
        expect(DEFAULT_HEIGHT).toBe(240);
    });

    it("persists and restores every field", () => {
        let storage = memory();
        let drawer = createFilesDrawer(storage);
        drawer.toggle();
        drawer.setSide("right");
        drawer.setWidth(310);
        drawer.setHeight(200);
        expect(get(createFilesDrawer(storage))).toEqual({ open: true, side: "right", width: 310, height: 200 });
    });

    it("keeps width and height separately while closing and changing side", () => {
        let drawer = createFilesDrawer(memory());
        drawer.setHeight(200);
        drawer.setWidth(350);
        drawer.setOpen(true);
        drawer.setSide("left");
        drawer.setOpen(false);
        drawer.setSide("top");
        expect(get(drawer)).toEqual({ open: false, side: "top", width: 350, height: 200 });
        drawer.setWidth(10);
        drawer.setHeight(10);
        expect(get(drawer)).toMatchObject({ width: MIN_WIDTH, height: MIN_HEIGHT });
    });

    it("migrates the first stored form, { open, height }, to a bottom pane", () => {
        let storage = memory(JSON.stringify({ open: true, height: 310 }));
        let drawer = createFilesDrawer(storage);
        expect(get(drawer)).toEqual({ open: true, side: "bottom", width: DEFAULT_WIDTH, height: 310 });
        drawer.setSide("left");
        expect(JSON.parse(storage.data.get("gg.diff.files")!)).toEqual({ open: true, side: "left", width: DEFAULT_WIDTH, height: 310 });
    });

    it("reads the older start and end sides and ignores unknown ones", () => {
        expect(get(createFilesDrawer(memory('{"open":true,"side":"end"}'))).side).toBe("right");
        expect(get(createFilesDrawer(memory('{"open":true,"side":"middle"}'))).side).toBe("bottom");
    });

    it("ignores malformed storage", () => {
        expect(get(createFilesDrawer(memory("{nope")))).toEqual(closed);
        expect(get(createFilesDrawer(memory('{"open":"yes","height":"tall","width":null}')))).toEqual(closed);
    });
});
