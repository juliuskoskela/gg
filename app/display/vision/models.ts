// colour vision deficiency simulation, for checking palettes; not used at runtime.
// all matrices act on linear sRGB. constants are copied from their sources:
// - Viénot, Brettel & Mollon (1999) and Brettel, Viénot & Mollon (1997), as published in
//   libDaltonLens (https://github.com/DaltonLens/libDaltonLens, public domain)
// - Machado, Oliveira & Fernandes (2009), table 1
//   (https://www.inf.ufrgs.br/~oliveira/pubs_files/CVD_Simulation/CVD_Simulation.html)
// the DaltonLens review (https://daltonlens.org/opensource-cvd-simulation/) finds Viénot and Brettel
// sound for protanopia and deuteranopia, Brettel the only valid model for tritanopia, and Machado
// suited to anomalous trichromacy rather than dichromacy. the checks follow that advice.

import { encoded, linear, luminance, type Rgb } from "./color";

type Matrix = [number, number, number, number, number, number, number, number, number];

function apply(m: Matrix, [r, g, b]: Rgb): Rgb {
    return [m[0] * r + m[1] * g + m[2] * b, m[3] * r + m[4] * g + m[5] * b, m[6] * r + m[7] * g + m[8] * b];
}

const vienot: Record<"protan" | "deutan", Matrix> = {
    protan: [0.11238, 0.88762, 0.00000, 0.11238, 0.88762, -0.00000, 0.00401, -0.00401, 1.00000],
    deutan: [0.29275, 0.70725, 0.00000, 0.29275, 0.70725, -0.00000, -0.02234, 0.02234, 1.00000],
};

const brettel: Record<"protan" | "deutan" | "tritan", { first: Matrix; second: Matrix; normal: Rgb }> = {
    protan: {
        first: [0.14980, 1.19548, -0.34528, 0.10764, 0.84864, 0.04372, 0.00384, -0.00540, 1.00156],
        second: [0.14570, 1.16172, -0.30742, 0.10816, 0.85291, 0.03892, 0.00386, -0.00524, 1.00139],
        normal: [0.00048, 0.00393, -0.00441],
    },
    deutan: {
        first: [0.36477, 0.86381, -0.22858, 0.26294, 0.64245, 0.09462, -0.02006, 0.02728, 0.99278],
        second: [0.37298, 0.88166, -0.25464, 0.25954, 0.63506, 0.10540, -0.01980, 0.02784, 0.99196],
        normal: [-0.00281, -0.00611, 0.00892],
    },
    tritan: {
        first: [1.01277, 0.13548, -0.14826, -0.01243, 0.86812, 0.14431, 0.07589, 0.80500, 0.11911],
        second: [0.93678, 0.18979, -0.12657, 0.06154, 0.81526, 0.12320, -0.37562, 1.12767, 0.24796],
        normal: [0.03901, -0.02788, -0.01113],
    },
};

// severities 0.2 to 0.9 in steps of 0.1 would add little over these three; 1.0 is dichromacy
const machado: Record<"protan" | "deutan", Record<string, Matrix>> = {
    protan: {
        "0.3": [0.630323, 0.465641, -0.095964, 0.069181, 0.890046, 0.040773, -0.006308, -0.007724, 1.014032],
        "0.6": [0.385450, 0.769005, -0.154455, 0.100526, 0.829802, 0.069673, -0.007442, -0.022190, 1.029632],
        "0.9": [0.203876, 0.990338, -0.194214, 0.112975, 0.794542, 0.092483, -0.005222, -0.041043, 1.046265],
    },
    deutan: {
        "0.3": [0.675425, 0.433850, -0.109275, 0.125303, 0.847755, 0.026942, -0.007950, 0.018572, 0.989378],
        "0.6": [0.498864, 0.674741, -0.173604, 0.205199, 0.754872, 0.039929, -0.011131, 0.030969, 0.980162],
        "0.9": [0.392952, 0.823610, -0.216562, 0.263559, 0.690210, 0.046232, -0.011910, 0.040281, 0.971630],
    },
};

export type Deficiency = "protan" | "deutan" | "tritan" | "achromat";

// a named way of seeing; checks require every simulation of a deficiency to pass
export type Simulation = { name: string; see: (rgb: Rgb) => Rgb };

function linearSimulation(name: string, transform: (rgb: Rgb) => Rgb): Simulation {
    return { name, see: rgb => encoded(transform(linear(rgb))) };
}

function brettelTransform(kind: keyof typeof brettel, severity = 1): (rgb: Rgb) => Rgb {
    let { first, second, normal } = brettel[kind];
    return rgb => {
        let side = rgb[0] * normal[0] + rgb[1] * normal[1] + rgb[2] * normal[2];
        let cvd = apply(side >= 0 ? first : second, rgb);
        return [0, 1, 2].map(i => cvd[i] * severity + rgb[i] * (1 - severity)) as Rgb;
    };
}

export let typical: Simulation = { name: "typical", see: rgb => rgb };

export function simulations(deficiency: Deficiency): Simulation[] {
    switch (deficiency) {
        case "protan":
        case "deutan":
            return [
                linearSimulation(`${deficiency} Viénot 1999`, rgb => apply(vienot[deficiency], rgb)),
                linearSimulation(`${deficiency} Brettel 1997`, brettelTransform(deficiency)),
                ...Object.entries(machado[deficiency]).map(([severity, m]) =>
                    linearSimulation(`${deficiency} Machado 2009 severity ${severity}`, rgb => apply(m, rgb))),
            ];
        case "tritan":
            return [
                linearSimulation("tritan Brettel 1997", brettelTransform("tritan")),
                linearSimulation("tritan Brettel 1997 severity 0.5", brettelTransform("tritan", 0.5)),
            ];
        case "achromat":
            // monochromats see one quantity per colour. cone monochromats follow photopic luminance;
            // rod monochromats follow scotopic sensitivity, which favours blues over reds.
            return [grey("achromat photopic", luminance), grey("achromat scotopic", scotopic)];
    }
}

function grey(name: string, measure: (rgb: Rgb) => number): Simulation {
    return { name, see: rgb => { let y = encoded([measure(rgb), 0, 0])[0]; return [y, y, y]; } };
}

// scotopic luminance from CIE XYZ after Larson, Rushmeier & Piatko (1997), normalised so white stays white
function scotopicRaw(rgb: Rgb): number {
    let [r, g, b] = linear(rgb);
    let x = 0.4124564 * r + 0.3575761 * g + 0.1804375 * b;
    let y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
    let z = 0.0193339 * r + 0.119192 * g + 0.9503041 * b;
    if (x <= 0) return 0;
    return Math.max(0, y * (1.33 * (1 + (y + z) / x) - 1.68));
}

const scotopicWhite = scotopicRaw([1, 1, 1]);

function scotopic(rgb: Rgb): number {
    return Math.min(1, scotopicRaw(rgb) / scotopicWhite);
}
