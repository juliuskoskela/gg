export interface MenuBehavior {
    onClose: () => void;
    returnFocus?: HTMLElement | null;
    initialFocus?: "menu" | "first" | "last";
    followPointer?: boolean;
}

function items(menu: HTMLElement) {
    return [...menu.querySelectorAll<HTMLButtonElement>('[role^="menuitem"]')]
        .filter(item => !item.matches(":disabled") && !item.closest("[hidden], [inert]"));
}

// shared interaction; each menu retains its own content and command policy.
export function menuBehavior(menu: HTMLElement, initial: MenuBehavior) {
    let options = initial;
    let previous = options.returnFocus ?? document.activeElement as HTMLElement | null;
    let tabbing = false;
    function focus(element: HTMLElement | undefined | null) { element?.focus({ preventScroll: true }); }
    if (options.initialFocus === "menu") focus(menu);
    else if (options.initialFocus) {
        let choices = items(menu);
        focus(options.initialFocus === "first" ? choices[0] : choices.at(-1));
    }
    function key(event: KeyboardEvent) {
        if (event.defaultPrevented) return;
        if (event.key === "Escape" || event.key === "Tab") {
            tabbing = event.key === "Tab";
            if (!tabbing) {
                event.preventDefault();
                event.stopPropagation();
                focus(options.returnFocus ?? previous);
            }
            options.onClose();
            return;
        }
        let choices = items(menu);
        if (!choices.length) return;
        let index = choices.indexOf(document.activeElement as HTMLButtonElement);
        if (event.key === "ArrowDown") index = (index + 1) % choices.length;
        else if (event.key === "ArrowUp") index = index < 0 ? choices.length - 1 : (index - 1 + choices.length) % choices.length;
        else if (event.key === "Home") index = 0;
        else if (event.key === "End") index = choices.length - 1;
        else if (event.key.length === 1 && /\S/.test(event.key) && !event.metaKey && !event.ctrlKey && !event.altKey) {
            let match = [...choices.slice(index + 1), ...choices.slice(0, index + 1)]
                .find(item => item.textContent?.trim().toLocaleLowerCase().startsWith(event.key.toLocaleLowerCase()));
            if (!match) return;
            index = choices.indexOf(match);
        } else return;
        event.preventDefault();
        focus(choices[index]);
    }
    function move(event: MouseEvent) {
        if (!options.followPointer) return;
        let target = (event.target as Element).closest<HTMLButtonElement>('[role^="menuitem"]');
        if (target && items(menu).includes(target) && document.activeElement !== target) focus(target);
    }
    function leave() { if (options.followPointer) focus(menu); }
    menu.addEventListener("keydown", key);
    menu.addEventListener("mousemove", move);
    menu.addEventListener("mouseleave", leave);
    return {
        update(value: MenuBehavior) { options = value; },
        destroy() {
            menu.removeEventListener("keydown", key);
            menu.removeEventListener("mousemove", move);
            menu.removeEventListener("mouseleave", leave);
            if (!tabbing && (document.activeElement === document.body || menu.contains(document.activeElement))) focus(options.returnFocus ?? previous);
        },
    };
}

export function menuPosition(
    point: { x: number; y: number },
    size: { width: number; height: number },
    placement: "pointer" | "above-end" | "below-end",
    viewport = { width: window.innerWidth, height: window.innerHeight },
) {
    let left = placement === "pointer" ? point.x : point.x - size.width;
    let top = placement === "above-end" ? point.y - size.height - 4 : placement === "below-end" ? point.y + 4 : point.y;
    return {
        left: Math.max(8, Math.min(left, viewport.width - size.width - 8)),
        top: Math.max(8, Math.min(top, viewport.height - size.height - 8)),
    };
}
