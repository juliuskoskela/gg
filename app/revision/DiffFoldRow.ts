export interface DiffFoldRowOptions {
    gap: number;
    lines?: number;
    expanded: boolean;
    onToggle: (button: HTMLButtonElement) => void;
}

// both Pierre slots and line annotations use the same native control.
export function createDiffFoldRow({ gap, lines, expanded, onToggle }: DiffFoldRowOptions): HTMLButtonElement {
    let button = document.createElement("button");
    button.type = "button";
    button.className = "diff-fold";
    button.dataset.foldGap = String(gap);
    button.setAttribute("aria-expanded", String(expanded));
    let count = lines === undefined ? "Unmodified lines" : `${lines} unmodified ${lines === 1 ? "line" : "lines"}`;
    button.setAttribute("aria-label", `${expanded ? "Collapse" : "Expand"} ${count.toLowerCase()}`);
    button.title = `${expanded ? "Collapse" : "Expand"} unmodified lines`;
    let icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    icon.setAttribute("viewBox", "0 0 24 24");
    icon.setAttribute("aria-hidden", "true");
    let path = document.createElementNS(icon.namespaceURI, "path");
    path.setAttribute("d", expanded ? "M18 15l-6-6-6 6" : "M9 6l6 6-6 6");
    icon.append(path);
    let label = document.createElement("span");
    label.textContent = count;
    button.append(icon, label);
    // otherwise the diff's line selection handler consumes the gesture.
    button.addEventListener("pointerdown", event => event.stopPropagation());
    button.addEventListener("click", event => { event.stopPropagation(); onToggle(button); });
    return button;
}
