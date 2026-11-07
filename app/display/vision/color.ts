// colour maths for checking palettes; not used at runtime.
// sRGB per IEC 61966-2-1, CIELAB with the D65 white, CIEDE2000 per Sharma, Wu & Dalal (2005),
// contrast per WCAG 2.x.

export type Rgb = [number, number, number];

export function toLinear(channel: number): number {
    return channel <= 0.04045 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
}

export function fromLinear(channel: number): number {
    let c = Math.min(1, Math.max(0, channel));
    return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

export function linear(rgb: Rgb): Rgb {
    return [toLinear(rgb[0]), toLinear(rgb[1]), toLinear(rgb[2])];
}

export function encoded(rgb: Rgb): Rgb {
    return [fromLinear(rgb[0]), fromLinear(rgb[1]), fromLinear(rgb[2])];
}

export function parseHex(hex: string): Rgb {
    let value = hex.replace("#", "");
    if (value.length === 3) value = [...value].map(c => c + c).join("");
    return [0, 2, 4].map(i => parseInt(value.slice(i, i + 2), 16) / 255) as Rgb;
}

export function toHex(rgb: Rgb): string {
    return "#" + rgb.map(c => Math.round(Math.min(1, Math.max(0, c)) * 255).toString(16).padStart(2, "0")).join("");
}

// accepts what getComputedStyle returns for colours: rgb(), rgba() and color(srgb …)
export function parseCssColor(value: string): Rgb {
    let trimmed = value.trim();
    if (trimmed.startsWith("#")) return parseHex(trimmed);
    let srgb = trimmed.match(/^color\(srgb\s+([\d.e+-]+)\s+([\d.e+-]+)\s+([\d.e+-]+)/);
    if (srgb) return [Number(srgb[1]), Number(srgb[2]), Number(srgb[3])];
    let rgb = trimmed.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/);
    if (rgb) return [Number(rgb[1]) / 255, Number(rgb[2]) / 255, Number(rgb[3]) / 255];
    throw new Error(`unsupported colour: ${value}`);
}

export function luminance(rgb: Rgb): number {
    let [r, g, b] = linear(rgb);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: Rgb, b: Rgb): number {
    let la = luminance(a);
    let lb = luminance(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export type Lab = [number, number, number];

const WHITE: [number, number, number] = [0.95047, 1, 1.08883];

export function lab(rgb: Rgb): Lab {
    let [r, g, b] = linear(rgb);
    let xyz = [
        0.4124564 * r + 0.3575761 * g + 0.1804375 * b,
        0.2126729 * r + 0.7151522 * g + 0.072175 * b,
        0.0193339 * r + 0.119192 * g + 0.9503041 * b,
    ];
    let f = xyz.map((v, i) => {
        let t = v / WHITE[i];
        return t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116;
    });
    return [116 * f[1] - 16, 500 * (f[0] - f[1]), 200 * (f[1] - f[2])];
}

const DEG = Math.PI / 180;

export function deltaE2000(x: Lab, y: Lab): number {
    let [l1, a1, b1] = x;
    let [l2, a2, b2] = y;
    let c1 = Math.hypot(a1, b1);
    let c2 = Math.hypot(a2, b2);
    let cBar = (c1 + c2) / 2;
    let g = 0.5 * (1 - Math.sqrt(Math.pow(cBar, 7) / (Math.pow(cBar, 7) + Math.pow(25, 7))));
    let a1p = (1 + g) * a1;
    let a2p = (1 + g) * a2;
    let c1p = Math.hypot(a1p, b1);
    let c2p = Math.hypot(a2p, b2);
    let h1p = c1p === 0 ? 0 : (Math.atan2(b1, a1p) / DEG + 360) % 360;
    let h2p = c2p === 0 ? 0 : (Math.atan2(b2, a2p) / DEG + 360) % 360;
    let dLp = l2 - l1;
    let dCp = c2p - c1p;
    let dhp = 0;
    if (c1p * c2p !== 0) {
        dhp = h2p - h1p;
        if (dhp > 180) dhp -= 360;
        else if (dhp < -180) dhp += 360;
    }
    let dHp = 2 * Math.sqrt(c1p * c2p) * Math.sin((dhp / 2) * DEG);
    let lBarp = (l1 + l2) / 2;
    let cBarp = (c1p + c2p) / 2;
    let hBarp = h1p + h2p;
    if (c1p * c2p !== 0) {
        if (Math.abs(h1p - h2p) <= 180) hBarp = (h1p + h2p) / 2;
        else hBarp = h1p + h2p < 360 ? (h1p + h2p + 360) / 2 : (h1p + h2p - 360) / 2;
    }
    let t = 1 - 0.17 * Math.cos((hBarp - 30) * DEG) + 0.24 * Math.cos(2 * hBarp * DEG)
        + 0.32 * Math.cos((3 * hBarp + 6) * DEG) - 0.2 * Math.cos((4 * hBarp - 63) * DEG);
    let dTheta = 30 * Math.exp(-Math.pow((hBarp - 275) / 25, 2));
    let rc = 2 * Math.sqrt(Math.pow(cBarp, 7) / (Math.pow(cBarp, 7) + Math.pow(25, 7)));
    let sl = 1 + (0.015 * Math.pow(lBarp - 50, 2)) / Math.sqrt(20 + Math.pow(lBarp - 50, 2));
    let sc = 1 + 0.045 * cBarp;
    let sh = 1 + 0.015 * cBarp * t;
    let rt = -Math.sin(2 * dTheta * DEG) * rc;
    return Math.sqrt(
        Math.pow(dLp / sl, 2) + Math.pow(dCp / sc, 2) + Math.pow(dHp / sh, 2) + rt * (dCp / sc) * (dHp / sh),
    );
}

export function difference(a: Rgb, b: Rgb): number {
    return deltaE2000(lab(a), lab(b));
}

// the porter-duff "over" result of a translucent colour on an opaque one, in encoded sRGB like browsers
export function mix(top: Rgb, bottom: Rgb, amount: number): Rgb {
    return [0, 1, 2].map(i => top[i] * amount + bottom[i] * (1 - amount)) as Rgb;
}
