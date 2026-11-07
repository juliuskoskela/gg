import "../../global.css";
import { afterEach, describe, expect, it } from "vitest";
import { parseCssColor } from "./color";
import { backgrounds, check, contrastRules, pairRules, textHues, type ResolvedPalette } from "./requirements";
import type { Deficiency } from "./models";

// every token the requirements read, resolved by the browser so colour-mix() and light-dark() are exact
let keys = [...new Set([
    ...backgrounds, ...textHues,
    ...pairRules.flatMap(rule => rule.pairs.flat()),
    ...contrastRules.flatMap(rule => [...rule.foreground, ...rule.background]),
])];

let shells: HTMLElement[] = [];
afterEach(() => { for (let shell of shells.splice(0)) shell.remove(); });

function resolve(vision: string, family: string, mode: "light" | "dark", depth: string): ResolvedPalette {
    let shell = document.createElement("div");
    shell.id = "shell";
    shell.className = mode;
    shell.dataset.themeFamily = family;
    shell.dataset.darkDepth = depth;
    shell.dataset.colorVision = vision;
    let probe = document.createElement("span");
    shell.append(probe);
    document.body.append(shell);
    shells.push(shell);
    let palette: ResolvedPalette = {};
    for (let key of keys) {
        probe.style.color = `var(--${key})`;
        let value = getComputedStyle(probe).color;
        palette[key] = parseCssColor(value);
    }
    shell.remove();
    return palette;
}

let families = ["warm", "neutral", "cold"];
let appearances: ["light" | "dark", string][] = [["light", "twilight"], ["dark", "twilight"], ["dark", "midnight"]];
let visions: [string, Deficiency][] = [["protan", "protan"], ["deutan", "deutan"], ["tritan", "tritan"], ["achromat", "achromat"]];

describe("colour vision palettes", () => {
    for (let [vision, deficiency] of visions) {
        for (let family of families) {
            for (let [mode, depth] of appearances) {
                it(`${vision} in ${family} ${mode === "light" ? "light" : depth}`, () => {
                    let failures = check(resolve(vision, family, mode, depth), deficiency);
                    expect(failures.map(f => `${f.rule}: ${f.detail} ${f.value.toFixed(2)} < ${f.minimum}`)).toEqual([]);
                });
            }
        }
    }

    it("replace every hue of the family", () => {
        // a hue left to the family would escape the checks above in other families
        for (let [vision] of visions) {
            let warm = resolve(vision, "warm", "dark", "twilight");
            let cold = resolve(vision, "cold", "dark", "twilight");
            for (let key of textHues) expect(warm[key], `${vision} ${key}`).toEqual(cold[key]);
        }
    });

    it("leave typical vision with the family's own hues", () => {
        let typical = resolve("typical", "warm", "light", "twilight");
        let protan = resolve("protan", "warm", "light", "twilight");
        expect(typical.positive).not.toEqual(protan.positive);
        expect(typical.surface).toEqual(protan.surface);
    });
});
