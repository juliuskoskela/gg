import type { Page } from "@playwright/test";

// include shadow roots and composite translucent surfaces as the browser displays them.
export async function renderedContrast(page: Page) {
    return page.evaluate(() => {
        let canvas = document.createElement("canvas"); canvas.width = canvas.height = 1;
        let ctx = canvas.getContext("2d", { willReadFrequently: true })!;
        function rgba(css: string) { ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = css; ctx.fillRect(0, 0, 1, 1); return [...ctx.getImageData(0, 0, 1, 1).data]; }
        function parent(element: Element) { return element.parentElement ?? (element.getRootNode() as ShadowRoot).host ?? null; }
        function composite(fg: number[], bg: number[]) { let alpha = fg[3] / 255; return [0, 1, 2].map(i => fg[i] * alpha + bg[i] * (1 - alpha)).concat(255); }
        function background(element: Element): number[] { let behind = parent(element); return composite(rgba(getComputedStyle(element).backgroundColor), behind ? background(behind) : [255, 255, 255, 255]); }
        function luminance(rgb: number[]) { let v = rgb.slice(0, 3).map(x => { let s = x / 255; return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4; }); return .2126 * v[0] + .7152 * v[1] + .0722 * v[2]; }
        let samples: { text: string; element: string; foreground: number[]; background: number[]; ratio: number }[] = [];
        function walk(root: Node) {
            for (let node of root.childNodes) {
                if (node instanceof Element) { if (node.shadowRoot) walk(node.shadowRoot); walk(node); }
                else if (node instanceof Text && node.textContent?.trim()) {
                    let element = node.parentElement;
                    if (!element || element.namespaceURI !== "http://www.w3.org/1999/xhtml" || element.closest("style, script, [disabled], [aria-disabled='true'], [aria-hidden='true']")) continue;
                    let range = document.createRange(); range.selectNode(node);
                    if (![...range.getClientRects()].some(rect => rect.width > 0 && rect.height > 0)) continue;
                    let css = getComputedStyle(element); if (css.visibility !== "visible") continue;
                    let bg = background(element), fg = composite(rgba(css.color), bg);
                    let a = luminance(fg), b = luminance(bg);
                    samples.push({ text: node.textContent.trim().slice(0, 80), element: element.tagName + "." + element.className, foreground: fg, background: bg, ratio: (Math.max(a, b) + .05) / (Math.min(a, b) + .05) });
                }
            }
        }
        walk(document.getElementById("shell")!);
        return samples;
    });
}
