// fixed coordinates avoid clipping inside scrollable panes and wrapped toolbars.
export function floating(node: HTMLElement, options: { open: boolean; anchor?: HTMLElement }) {
    let frame = 0;
    function place() {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
            if (!options.open || !options.anchor) return;
            let bounds = options.anchor.getBoundingClientRect();
            let width = node.offsetWidth, height = node.offsetHeight;
            let left = Math.max(12, Math.min(innerWidth - width - 12, bounds.right - width));
            let below = bounds.bottom + 6;
            let top = below + height <= innerHeight - 12 ? below : Math.max(12, bounds.top - height - 6);
            node.style.left = `${left}px`;
            node.style.top = `${top}px`;
        });
    }
    let observer = new ResizeObserver(place);
    observer.observe(node);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    place();
    return {
        update(next: typeof options) { options = next; place(); },
        destroy() { cancelAnimationFrame(frame); observer.disconnect(); window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); },
    };
}
