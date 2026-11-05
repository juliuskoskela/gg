export function autoHideScrollbars(root: HTMLElement) {
    let timers = new Map<HTMLElement, ReturnType<typeof setTimeout>>();
    let dragging: HTMLElement | undefined;

    function reveal(element: HTMLElement) {
        clearTimeout(timers.get(element));
        element.setAttribute("data-scrollbar-active", "");
        timers.set(element, setTimeout(() => {
            timers.delete(element);
            if (dragging !== element) element.removeAttribute("data-scrollbar-active");
        }, 900));
    }
    function scroll(event: Event) {
        if (event.target instanceof HTMLElement) reveal(event.target);
    }
    function edgeTarget(event: PointerEvent) {
        for (let node of event.composedPath()) {
            if (!(node instanceof HTMLElement)) continue;
            let bounds = node.getBoundingClientRect();
            let style = getComputedStyle(node);
            let vertical = /auto|scroll/.test(style.overflowY) && node.scrollHeight > node.clientHeight;
            let horizontal = /auto|scroll/.test(style.overflowX) && node.scrollWidth > node.clientWidth;
            let edge = style.direction === "rtl" ? bounds.left : bounds.right;
            if ((vertical && Math.abs(event.clientX - edge) <= 14) || (horizontal && Math.abs(event.clientY - bounds.bottom) <= 14)) return node;
            if (node === root) break;
        }
    }
    function pointerMove(event: PointerEvent) {
        if (event.pointerType !== "mouse") return;
        let element = edgeTarget(event);
        if (element) reveal(element);
    }
    function pointerDown(event: PointerEvent) {
        dragging = edgeTarget(event);
        if (dragging) reveal(dragging);
    }
    function pointerUp() {
        let element = dragging;
        dragging = undefined;
        if (element) reveal(element);
    }
    root.addEventListener("scroll", scroll, true);
    root.addEventListener("pointermove", pointerMove as EventListener, true);
    root.addEventListener("pointerdown", pointerDown as EventListener, true);
    window.addEventListener("pointerup", pointerUp);
    window.addEventListener("pointercancel", pointerUp);
    window.addEventListener("blur", pointerUp);
    return {
        destroy() {
            root.removeEventListener("scroll", scroll, true);
            root.removeEventListener("pointermove", pointerMove as EventListener, true);
            root.removeEventListener("pointerdown", pointerDown as EventListener, true);
            window.removeEventListener("pointerup", pointerUp);
            window.removeEventListener("pointercancel", pointerUp);
            window.removeEventListener("blur", pointerUp);
            dragging?.removeAttribute("data-scrollbar-active");
            for (let [element, timer] of timers) {
                clearTimeout(timer);
                element.removeAttribute("data-scrollbar-active");
            }
        },
    };
}
