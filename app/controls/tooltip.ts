export type TooltipContent = { label: string; value?: string; description?: string };

let nextId = 0;

export function tooltip(node: HTMLElement, content: TooltipContent) {
    let popup: HTMLDivElement | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let tooltipId = `gg-tooltip-${++nextId}`;

    function cancelTimer() { clearTimeout(timer); }

    function hide() {
        cancelTimer();
        popup?.remove();
        popup = null;
        window.removeEventListener("keydown", key, true);
        window.removeEventListener("scroll", hide, true);
        window.removeEventListener("resize", hide);
        window.removeEventListener("blur", hide);
        let descriptions = node.getAttribute("aria-describedby")?.split(/\s+/).filter(id => id !== tooltipId);
        if (descriptions?.length) node.setAttribute("aria-describedby", descriptions.join(" "));
        else node.removeAttribute("aria-describedby");
    }

    function leave() {
        cancelTimer();
        timer = setTimeout(hide, 120);
    }

    function show() {
        cancelTimer();
        if (popup || !node.isConnected) return;
        popup = document.createElement("div");
        popup.id = tooltipId;
        popup.className = "gg-tooltip";
        popup.setAttribute("role", "tooltip");
        let label = document.createElement("p");
        label.className = "gg-tooltip-label";
        label.textContent = content.label;
        popup.append(label);
        if (content.value) {
            let value = document.createElement("code");
            value.textContent = content.value;
            popup.append(value);
        }
        if (content.description) {
            let description = document.createElement("p");
            description.textContent = content.description;
            popup.append(description);
        }
        popup.addEventListener("mouseenter", cancelTimer);
        popup.addEventListener("mouseleave", leave);
        // inherit the app's palette while the top layer avoids clipping in the virtualized graph
        let topLayer = typeof popup.showPopover === "function";
        if (topLayer) popup.setAttribute("popover", "manual");
        (node.closest("#shell, .dark, .light") ?? document.body).append(popup);
        if (topLayer) popup.showPopover();
        let anchor = node.getBoundingClientRect();
        let bounds = popup.getBoundingClientRect();
        popup.style.left = `${Math.max(8, Math.min(anchor.left, window.innerWidth - bounds.width - 8))}px`;
        popup.style.top = `${anchor.bottom + bounds.height + 8 <= window.innerHeight - 8 ? anchor.bottom + 8 : Math.max(8, anchor.top - bounds.height - 8)}px`;
        node.setAttribute("aria-describedby", [node.getAttribute("aria-describedby"), tooltipId].filter(Boolean).join(" "));
        window.addEventListener("keydown", key, true);
        window.addEventListener("scroll", hide, true);
        window.addEventListener("resize", hide);
        window.addEventListener("blur", hide);
    }

    function enter() { cancelTimer(); timer = setTimeout(show, 350); }
    function key(event: KeyboardEvent) {
        if (event.key === "Escape" && popup) {
            event.preventDefault();
            event.stopPropagation();
            hide();
        }
    }

    node.addEventListener("mouseenter", enter);
    node.addEventListener("mouseleave", leave);
    node.addEventListener("focusin", show);
    node.addEventListener("focusout", hide);
    node.addEventListener("contextmenu", hide);
    node.addEventListener("dragstart", hide);

    return {
        update(next: TooltipContent) {
            if (next.value !== content.value || next.label !== content.label || next.description !== content.description) hide();
            content = next;
        },
        destroy() {
            hide();
            node.removeEventListener("mouseenter", enter);
            node.removeEventListener("mouseleave", leave);
            node.removeEventListener("focusin", show);
            node.removeEventListener("focusout", hide);
            node.removeEventListener("contextmenu", hide);
            node.removeEventListener("dragstart", hide);
        },
    };
}
