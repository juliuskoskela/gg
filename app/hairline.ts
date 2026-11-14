// a 1px border paints as whole device pixels (never fewer than one), but a 1px offset or gap at a fractional
// display scale does not. this is the painted width of a 1px border, so seams, the focus trace laid over them
// and the rules inside views can all line up on the same pixels
export function trackHairline(root: HTMLElement = document.documentElement): () => void {
    let query: MediaQueryList | null = null;
    let update = () => {
        let ratio = window.devicePixelRatio || 1;
        root.style.setProperty("--hairline", `${Math.max(1, Math.floor(ratio)) / ratio}px`);
        query?.removeEventListener("change", update);
        query = window.matchMedia(`(resolution: ${ratio}dppx)`);
        query.addEventListener("change", update);
    };
    update();
    return () => {
        query?.removeEventListener("change", update);
        root.style.removeProperty("--hairline");
    };
}
