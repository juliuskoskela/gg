import { describe, expect, it } from "vitest";
import { contrast, deltaE2000, lab, parseCssColor, parseHex, type Lab } from "./color";

describe("colour maths", () => {
    // reference pairs from Sharma, Wu & Dalal (2005), table 1
    let pairs: [Lab, Lab, number][] = [
        [[50, 2.6772, -79.7751], [50, 0, -82.7485], 2.0425],
        [[50, 0, 0], [50, -1, 2], 2.3669],
        [[50, 2.5, 0], [73, 25, -18], 27.1492],
        [[60.2574, -34.0099, 36.2677], [60.4626, -34.1751, 39.4387], 1.2644],
        [[50, 2.5, 0], [50, 0, -2.5], 4.3065],
    ];
    it.each(pairs)("CIEDE2000 %j vs %j", (a, b, expected) => {
        expect(deltaE2000(a, b)).toBeCloseTo(expected, 4);
        expect(deltaE2000(b, a)).toBeCloseTo(expected, 4);
    });

    it("maps the sRGB white and black to the ends of CIELAB", () => {
        let white = lab([1, 1, 1]);
        expect(white[0]).toBeCloseTo(100, 2);
        expect(Math.abs(white[1]) + Math.abs(white[2])).toBeLessThan(0.01);
        expect(lab([0, 0, 0])[0]).toBeCloseTo(0, 6);
    });

    it("computes WCAG contrast", () => {
        expect(contrast([1, 1, 1], [0, 0, 0])).toBeCloseTo(21, 6);
        expect(contrast(parseHex("#777777"), [1, 1, 1])).toBeCloseTo(4.48, 2);
    });

    it("reads computed colour strings", () => {
        expect(parseCssColor("rgb(255, 128, 0)")).toEqual([1, 128 / 255, 0]);
        expect(parseCssColor("color(srgb 0.5 0.25 1)")).toEqual([0.5, 0.25, 1]);
        expect(parseCssColor("#0a0b0c")).toEqual(parseHex("0a0b0c"));
    });
});
