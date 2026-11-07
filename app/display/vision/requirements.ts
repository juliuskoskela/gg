// what a palette must keep distinct, and how legible its colours must be, for each way of seeing.
// thresholds are CIEDE2000 differences between simulated colours; see doc/specs/color-vision.md.

import { contrast, difference, type Rgb } from "./color";
import { simulations, typical, type Deficiency, type Simulation } from "./models";

// colours resolved from the theme, keyed by css custom property without the leading dashes
export type ResolvedPalette = Record<string, Rgb>;

export let backgrounds = ["ground", "surface", "raised", "popover-surface", "input-surface", "panel-header-bg"];

// hues drawn as text or thin strokes on the backgrounds above
export let textHues = [
    "accent", "positive", "negative", "warning", "brand",
    "lane-0", "lane-1", "lane-2", "lane-3", "lane-4", "lane-5", "lane-6", "lane-7",
    "diffs-token-keyword", "diffs-token-function", "diffs-token-constant", "diffs-token-string",
];

type PairRule = { group: string; pairs: [string, string][]; minimum: number; achromat?: number };

function allPairs(keys: string[]): [string, string][] {
    return keys.flatMap((a, i) => keys.slice(i + 1).map(b => [a, b] as [string, string]));
}

let syntaxHues = ["diffs-token-keyword", "diffs-token-function", "diffs-token-constant", "diffs-token-string"];
let lanes = ["lane-0", "lane-1", "lane-2", "lane-3", "lane-4", "lane-5", "lane-6", "lane-7"];

export let pairRules: PairRule[] = [
    // status colours carry meaning on their own in counts, badges and warnings
    { group: "status", pairs: [["positive", "negative"], ["negative", "warning"]], minimum: 20, achromat: 10 },
    // with text contrast on dark surfaces, three lightness levels 10 apart don't fit between the contrast floor
    // and white, so monochromats get danger kept furthest apart; warnings also carry their triangle icon.
    { group: "status", pairs: [["positive", "warning"]], minimum: 20, achromat: 8 },
    { group: "accent against danger", pairs: [["accent", "negative"]], minimum: 15, achromat: 6 },
    // reference chips also differ by icon, so colour only has to separate them at a glance
    { group: "references", pairs: allPairs(["ref-bookmark", "ref-tag", "ref-workspace", "ref-remote"]), minimum: 12 },
    // syntax colours help reading; plain text and comments must stay apart from them.
    // comments are quiet text by design, so they only have to differ from the coloured tokens.
    { group: "syntax", pairs: [...allPairs(["text", ...syntaxHues]), ...syntaxHues.map(hue => ["diffs-token-comment", hue] as [string, string])], minimum: 8 },
    // neighbouring graph lanes must separate; distant ones are kept apart by position
    { group: "neighbouring lanes", pairs: lanes.map((lane, i) => [lane, lanes[(i + 1) % lanes.length]] as [string, string]), minimum: 10 },
    { group: "all lanes", pairs: allPairs(lanes), minimum: 5 },
    // colour-vision palettes turn on +/− line markers; the tints must still read as different where hue survives.
    // monochromats rely on the markers, since tints this light can't differ enough in lightness.
    { group: "diff lines", pairs: [["diff-addition", "diff-deletion"], ["diff-addition-emphasis", "diff-deletion-emphasis"]], minimum: 5 },
    { group: "primary against destructive", pairs: [["accent-solid", "danger-solid"]], minimum: 10 },
];

export let contrastRules: { group: string; foreground: string[]; background: string[]; minimum: number }[] = [
    // WCAG 2 AA for body text
    { group: "text hues", foreground: textHues, background: backgrounds, minimum: 4.5 },
    { group: "diff text", foreground: ["text", "positive", "diffs-token-inserted"], background: ["diff-addition", "diff-addition-emphasis"], minimum: 4.5 },
    { group: "diff text", foreground: ["text", "negative", "diffs-token-deleted"], background: ["diff-deletion", "diff-deletion-emphasis"], minimum: 4.5 },
    { group: "solid buttons", foreground: ["text-on-accent"], background: ["accent-solid", "accent-solid-hover", "accent-solid-pressed"], minimum: 4.5 },
    { group: "solid buttons", foreground: ["text-on-danger"], background: ["danger-solid", "danger-solid-hover", "danger-solid-pressed"], minimum: 4.5 },
];

export type Failure = { rule: string; detail: string; value: number; minimum: number };

export function check(palette: ResolvedPalette, deficiency: Deficiency | null): Failure[] {
    let failures: Failure[] = [];
    let get = (key: string) => {
        let colour = palette[key];
        if (!colour) throw new Error(`palette has no ${key}`);
        return colour;
    };
    for (let rule of contrastRules) {
        for (let fg of rule.foreground) for (let bg of rule.background) {
            let value = contrast(get(fg), get(bg));
            if (value < rule.minimum) failures.push({ rule: `contrast: ${rule.group}`, detail: `${fg} on ${bg}`, value, minimum: rule.minimum });
        }
    }
    // the people around someone also use their screen, so every palette must also work for typical vision
    let views: Simulation[] = deficiency ? [typical, ...simulations(deficiency)] : [typical];
    for (let view of views) {
        let achromat = view.name.startsWith("achromat");
        for (let rule of pairRules) {
            let minimum = achromat ? rule.achromat : rule.minimum;
            if (minimum === undefined) continue;
            for (let [a, b] of rule.pairs) {
                let value = difference(view.see(get(a)), view.see(get(b)));
                if (value < minimum) failures.push({ rule: `${rule.group} (${view.name})`, detail: `${a} vs ${b}`, value, minimum });
            }
        }
    }
    return failures;
}
