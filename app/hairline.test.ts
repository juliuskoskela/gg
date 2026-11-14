import { afterEach, describe, expect, it } from "vitest";
import { trackHairline } from "./hairline";

describe("trackHairline", () => {
    let stop: (() => void) | null = null;
    afterEach(() => { stop?.(); stop = null; });

    it("sizes the hairline to the painted width of a 1px border", () => {
        let root = document.createElement("div");
        stop = trackHairline(root);
        let ratio = window.devicePixelRatio;
        expect(root.style.getPropertyValue("--hairline")).toBe(`${Math.max(1, Math.floor(ratio)) / ratio}px`);
    });

    it("removes the hairline when stopped", () => {
        let root = document.createElement("div");
        trackHairline(root)();
        expect(root.style.getPropertyValue("--hairline")).toBe("");
    });
});
