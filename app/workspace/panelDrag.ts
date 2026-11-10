import { draggable } from "@neodrag/svelte";
import { get, writable } from "svelte/store";
import { tick } from "svelte";
import { dock, movePanel, type DockNode, type Edge, type PanelId } from "./dock";

type Landing = { target: PanelId; edge: Edge; x: number; y: number; width: number; height: number; placement: Edge };
type Drag = { id: PanelId; x: number; y: number; landing: Landing | null };
export let panelDragging = writable<Drag | null>(null);
export let dockAnnouncement = writable("");

function landingAt(x: number, y: number, id: PanelId): Landing | null {
    let group = [...document.querySelectorAll<HTMLElement>(".tabs[data-panel-group]")].find(element => {
        let box = element.getBoundingClientRect();
        return x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;
    });
    if (!group) return null;
    let box = group.getBoundingClientRect();
    let header = group.querySelector<HTMLElement>("[data-panel-chrome]")!.getBoundingClientRect();
    let target = group.dataset.panelGroup as PanelId;
    let edge: Edge = "tab";
    if (y > header.bottom) {
        let distances = [(x - box.left) / box.width, (box.right - x) / box.width,
            (y - header.bottom) / (box.bottom - header.bottom), (box.bottom - y) / (box.bottom - header.bottom)];
        let nearest = Math.min(...distances);
        if (nearest < 0.25) edge = (["left", "right", "top", "bottom"] as Edge[])[distances.indexOf(nearest)];
    } else {
        let tab = [...group.querySelectorAll<HTMLElement>("[role=tab]")].find(element => {
            let rect = element.getBoundingClientRect();
            return x >= rect.left && x <= rect.right;
        });
        if (tab) {
            target = tab.id.replace("panel-tab-", "") as PanelId;
            let rect = tab.getBoundingClientRect();
            if (tab === [...group.querySelectorAll("[role=tab]")].at(-1) && x > rect.left + rect.width / 2) edge = "tab-end";
        } else edge = "tab-end";
    }
    let tabs = group.querySelectorAll("[data-panel-handle]");
    if (tabs.length === 1 && target === id) return null;
    if (edge === "tab-end" && target === id) {
        target = [...tabs].map(tab => tab.id.replace("panel-tab-", "") as PanelId).find(panel => panel !== id) ?? target;
    }
    if ((edge === "tab" || edge === "tab-end") && target === id) return null;
    let append = edge === "tab" && y > header.bottom;
    let root = get(dock).root;
    let surface = group.closest<HTMLElement>(".workspace-dock")!;
    if (!root) return null;
    let rtl = getComputedStyle(surface).direction === "rtl";
    let placement = append ? "tab-end" : rtl && edge === "left" ? "right" : rtl && edge === "right" ? "left" : edge;
    let next = movePanel(root, id, target, placement);
    let rect = surface.getBoundingClientRect(), style = getComputedStyle(surface);
    // views are tiles inside the dock's padding, split by a gutter rather than a hairline
    let start = parseFloat(style.paddingLeft) || 0, end = parseFloat(style.paddingRight) || 0;
    let gutter = parseFloat(style.getPropertyValue("--dock-gutter")) || 1;
    let bounds = panelBounds(next, id, { x: rect.left + start, y: rect.top, width: rect.width - start - end, height: rect.height }, rtl, gutter);
    return bounds ? { target, edge, ...bounds, placement } : null;
}

type Bounds = { x: number; y: number; width: number; height: number };
function panelBounds(node: DockNode, id: PanelId, bounds: Bounds, rtl: boolean, gutter: number): Bounds | null {
    if (node.type === "tabs") return node.panels.includes(id) ? bounds : null;
    let first = { ...bounds }, second = { ...bounds };
    if (node.direction === "row") {
        first.width = (bounds.width - gutter) * node.ratio;
        second.width = bounds.width - first.width - gutter;
        if (rtl) first.x += second.width + gutter;
        else second.x += first.width + gutter;
    } else {
        first.height = (bounds.height - gutter) * node.ratio;
        second.height = bounds.height - first.height - gutter;
        second.y += first.height + gutter;
    }
    return panelBounds(node.first, id, first, rtl, gutter) ?? panelBounds(node.second, id, second, rtl, gutter);
}

export function panelDraggable(node: HTMLElement, options: { id: PanelId; enabled: boolean; move: (id: PanelId, target: PanelId, edge: Edge) => void }) {
    let touchAction = node.style.touchAction;
    let cancelled = false;
    let keyboard = false;
    let pending = false;
    let destroyed = false;
    let action: ReturnType<typeof draggable>;
    let dragOptions = () => ({
        disabled: !options.enabled,
        threshold: { distance: 6 },
        position: { x: 0, y: 0 },
        applyUserSelectHack: false,
        transform: () => {},
        onDragStart: ({ event }: { event: PointerEvent }) => {
            cancelled = false;
            panelDragging.set({ id: options.id, x: event.clientX, y: event.clientY, landing: null });
        },
        onDrag: ({ event }: { event: PointerEvent }) => {
            if (!cancelled) panelDragging.set({ id: options.id, x: event.clientX, y: event.clientY, landing: landingAt(event.clientX, event.clientY, options.id) });
        },
        onDragEnd: () => finish(),
    });
    action = draggable(node, dragOptions());
    node.style.touchAction = options.enabled ? "none" : touchAction;
    function cancel() {
        let ownsDrag = get(panelDragging)?.id === options.id;
        if (!ownsDrag && !pending) return;
        cancelled = true; keyboard = false; pending = false;
        if (ownsDrag) { panelDragging.set(null); dockAnnouncement.set("Panel move cancelled."); }
        action?.destroy?.();
        node.classList.remove("neodrag-dragging");
        if (!destroyed) action = draggable(node, dragOptions());
    }
    function finish() {
        pending = false;
        action?.update?.(dragOptions());
        let drag = get(panelDragging);
        panelDragging.set(null);
        keyboard = false;
        if (!cancelled && drag?.id === options.id && drag.landing) {
            options.move(options.id, drag.landing.target, drag.landing.placement);
            dockAnnouncement.set("Panel moved.");
            void tick().then(() => document.getElementById(`panel-tab-${options.id}`)?.focus());
        }
    }
    function keydown(event: KeyboardEvent) {
        if (event.key === "Escape") { cancel(); return; }
        if (!options.enabled || event.target !== node) return;
        if (event.key === " " && !keyboard) {
            event.preventDefault(); event.stopImmediatePropagation();
            cancelled = false; keyboard = true;
            let rect = node.getBoundingClientRect();
            panelDragging.set({ id: options.id, x: rect.left, y: rect.bottom, landing: null });
        } else if (keyboard && (event.key === "Enter" || event.key === " ")) {
            event.preventDefault(); event.stopImmediatePropagation(); finish();
        } else if (keyboard && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Tab"].includes(event.key)) {
            event.preventDefault(); event.stopImmediatePropagation();
            let groups = [...document.querySelectorAll<HTMLElement>(".tabs[data-panel-group]")];
            let drag = get(panelDragging)!;
            let current = groups.findIndex(group => group.contains(document.getElementById(`panel-tab-${drag.landing?.target ?? options.id}`)));
            let group = event.key === "Tab" ? groups[(current + (event.shiftKey ? groups.length - 1 : 1)) % groups.length] : groups[Math.max(0, current)];
            let rect = group.getBoundingClientRect();
            let x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
            if (event.key === "ArrowLeft") x = rect.left + 8;
            if (event.key === "ArrowRight") x = rect.right - 8;
            if (event.key === "ArrowUp") y = group.querySelector("[data-panel-chrome]")!.getBoundingClientRect().bottom + 8;
            if (event.key === "ArrowDown") y = rect.bottom - 8;
            panelDragging.set({ id: options.id, x, y, landing: landingAt(x, y, options.id) });
        }
    }
    function pointerdown(event: PointerEvent) { if (options.enabled && event.button === 0) pending = true; }
    function pointerup() { pending = false; }
    node.addEventListener("pointerdown", pointerdown, true);
    window.addEventListener("pointerup", pointerup);
    function focusout() { if (keyboard) cancel(); }
    node.addEventListener("focusout", focusout);
    node.addEventListener("keydown", keydown, true);
    window.addEventListener("keydown", escape);
    window.addEventListener("blur", cancel);
    window.addEventListener("pointercancel", cancel);
    function escape(event: KeyboardEvent) { if (event.key === "Escape") cancel(); }
    return {
        update(next: typeof options) { options = next; action?.update?.(dragOptions()); node.style.touchAction = options.enabled ? "none" : touchAction; },
        destroy() {
            destroyed = true;
            cancel();
            action?.destroy?.();
            node.removeEventListener("pointerdown", pointerdown, true);
            window.removeEventListener("pointerup", pointerup);
            node.style.touchAction = touchAction;
            node.removeEventListener("focusout", focusout);
            node.removeEventListener("keydown", keydown, true);
            window.removeEventListener("keydown", escape);
            window.removeEventListener("blur", cancel);
            window.removeEventListener("pointercancel", cancel);
        },
    };
}
