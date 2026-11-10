// a scrollbar shows while someone scrolls, hovers it or drags it, and never because the app moved content itself
let SCROLL_HOLD = 900;
let HOVER_HOLD = 700;
// a scroll this soon after real input counts as the person's own
let INPUT_WINDOW = 1000;
// how far beyond the bar itself a pointer still reveals it
let HOVER_REACH = 6;

type Axis = "vertical" | "horizontal";

/** which of an element's scrollbars, if any, lies under the point; `reach` widens the bar's band */
export function scrollbarAt(node: HTMLElement, x: number, y: number, reach = 0): Axis | null {
    let style = getComputedStyle(node);
    let bounds = node.getBoundingClientRect();
    if (x < bounds.left || x > bounds.right || y < bounds.top || y > bounds.bottom) return null;
    let vertical = /auto|scroll/.test(style.overflowY) && node.scrollHeight > node.clientHeight;
    let horizontal = /auto|scroll/.test(style.overflowX) && node.scrollWidth > node.clientWidth;
    let rtl = style.direction === "rtl";
    // the bar occupies the space between the padding box and the border box; overlay bars take none,
    // and are then found in a band as wide as the styled track
    let track = parseFloat(style.getPropertyValue("--scrollbar-track")) || 10;
    let barWidth = node.offsetWidth - node.clientWidth - node.clientLeft * 2 || track;
    let barHeight = node.offsetHeight - node.clientHeight - node.clientTop * 2 || track;
    if (vertical) {
        let band = Math.max(barWidth, 0) + reach;
        let inside = rtl ? x - bounds.left - node.clientLeft : bounds.right - node.clientLeft - x;
        if (inside >= 0 && inside <= band) return "vertical";
    }
    if (horizontal) {
        let band = Math.max(barHeight, 0) + reach;
        let inside = bounds.bottom - node.clientTop - y;
        if (inside >= 0 && inside <= band) return "horizontal";
    }
    return null;
}

export function autoHideScrollbars(root: HTMLElement) {
    let timers = new Map<HTMLElement, ReturnType<typeof setTimeout>>();
    let hovered: HTMLElement | undefined;
    let dragging: HTMLElement | undefined;
    let lastInput = -Infinity;

    function show(element: HTMLElement, hold: number | null) {
        clearTimeout(timers.get(element));
        timers.delete(element);
        element.setAttribute("data-scrollbar-active", "");
        if (hold !== null) timers.set(element, setTimeout(() => hide(element), hold));
    }
    function hide(element: HTMLElement) {
        clearTimeout(timers.get(element));
        timers.delete(element);
        if (element === dragging || element === hovered) return;
        element.removeAttribute("data-scrollbar-active");
    }
    function input() { lastInput = performance.now(); }

    function scroll(event: Event) {
        if (!(event.target instanceof HTMLElement)) return;
        if (event.target === dragging || event.target === hovered) return;
        if (performance.now() - lastInput <= INPUT_WINDOW) show(event.target, SCROLL_HOLD);
    }
    function barUnder(event: PointerEvent, reach: number) {
        for (let node of event.composedPath()) {
            if (!(node instanceof HTMLElement)) continue;
            if (scrollbarAt(node, event.clientX, event.clientY, reach)) return node;
            if (node === root) break;
        }
    }
    function release() {
        let element = dragging;
        dragging = undefined;
        if (element) show(element, HOVER_HOLD);
    }
    function pointerMove(event: PointerEvent) {
        if (event.pointerType !== "mouse") return;
        // a release can be swallowed or happen outside the window; a move with no button held ends the drag
        if (dragging && event.buttons === 0) release();
        if (dragging) return;
        let element = barUnder(event, HOVER_REACH);
        if (element === hovered) return;
        let previous = hovered;
        hovered = element;
        if (previous) show(previous, HOVER_HOLD);
        if (element) show(element, null);
    }
    function pointerLeave() {
        let previous = hovered;
        hovered = undefined;
        if (previous) show(previous, HOVER_HOLD);
    }
    function pointerDown(event: PointerEvent) {
        input();
        // only a press on the bar itself grabs it; a button near a scrollable edge does not
        dragging = barUnder(event, 0);
        if (dragging) show(dragging, null);
    }
    function hideAll() {
        dragging = undefined;
        hovered = undefined;
        for (let element of [...root.querySelectorAll<HTMLElement>("[data-scrollbar-active]")]) hide(element);
    }
    function visibility() { if (document.hidden) hideAll(); }

    root.addEventListener("scroll", scroll, true);
    root.addEventListener("pointermove", pointerMove as EventListener, true);
    root.addEventListener("pointerdown", pointerDown as EventListener, true);
    root.addEventListener("pointerleave", pointerLeave);
    root.addEventListener("wheel", input, { capture: true, passive: true });
    root.addEventListener("touchstart", input, { capture: true, passive: true });
    root.addEventListener("keydown", input, true);
    // capture, so a component that stops the release cannot leave a bar stuck
    window.addEventListener("pointerup", release, true);
    window.addEventListener("pointercancel", release, true);
    window.addEventListener("blur", hideAll);
    document.addEventListener("visibilitychange", visibility);
    return {
        destroy() {
            root.removeEventListener("scroll", scroll, true);
            root.removeEventListener("pointermove", pointerMove as EventListener, true);
            root.removeEventListener("pointerdown", pointerDown as EventListener, true);
            root.removeEventListener("pointerleave", pointerLeave);
            root.removeEventListener("wheel", input, { capture: true });
            root.removeEventListener("touchstart", input, { capture: true });
            root.removeEventListener("keydown", input, true);
            window.removeEventListener("pointerup", release, true);
            window.removeEventListener("pointercancel", release, true);
            window.removeEventListener("blur", hideAll);
            document.removeEventListener("visibilitychange", visibility);
            for (let timer of timers.values()) clearTimeout(timer);
            timers.clear();
            for (let element of root.querySelectorAll("[data-scrollbar-active]")) element.removeAttribute("data-scrollbar-active");
        },
    };
}
