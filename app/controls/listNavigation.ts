export interface Selection {
    from: number;
    to: number;
}

export interface List {
    getSize(): number;
    getSelection(): Selection;
    selectRow(row: number): void;
    extendSelection(row: number): void;
    editRow(row: number): void;
    moveFocus?(row: number): void;
    toggleRow?(row: number): void;
    clearToggled?(): boolean;
}

export type ListAction =
    | { type: "select" | "extend" | "focus" | "edit" | "toggle"; index: number }
    | { type: "clear" };

export function navigationIndex(key: string, index: number, size: number, pageRows = 1): number | null {
    if (size <= 0) return null;
    let next: number;
    switch (key) {
        case "ArrowUp": next = index - 1; break;
        case "ArrowDown": next = index + 1; break;
        case "PageUp": next = index - pageRows; break;
        case "PageDown": next = index + pageRows; break;
        case "Home": next = 0; break;
        case "End": next = size - 1; break;
        default: return null;
    }
    return Math.max(0, Math.min(size - 1, next));
}

export function selectionAction(
    event: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "shiftKey">,
    selection: Selection,
    size: number,
    pageRows: number,
    capabilities: { focus: boolean; toggle: boolean; clear: boolean },
): ListAction | null {
    if (size <= 0) return null;
    let modified = event.ctrlKey || event.metaKey;
    let { from, to } = selection;
    if (event.key === "Escape") return capabilities.clear ? { type: "clear" } : null;
    if (event.key === " " && modified) return capabilities.toggle && to >= 0 ? { type: "toggle", index: to } : null;
    if (event.key === "Enter") return from === to ? { type: "edit", index: from } : null;
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        let type: "focus" | "extend" | "select" = modified && !event.shiftKey && capabilities.focus ? "focus" : event.shiftKey ? "extend" : "select";
        let anchor = type !== "select" ? to : event.key === "ArrowUp" ? Math.min(from, to) : Math.max(from, to);
        let index = navigationIndex(event.key, anchor, size)!;
        if (anchor < 0 || index === anchor) return null;
        return { type, index };
    }
    let anchor = event.key === "PageUp" ? Math.min(from, to) : Math.max(from, to);
    let index = navigationIndex(event.key, anchor, size, pageRows);
    return index === null ? null : { type: "select", index };
}

export function visibleItems(root: HTMLElement, selector: string): HTMLElement[] {
    return [...root.querySelectorAll<HTMLElement>(selector)]
        .filter(item => item.getClientRects().length > 0 && !item.matches(":disabled"));
}

// keep a fixed-size row pool near the viewport, including placeholders at the end.
export function virtualRange(top: number, height: number, rowHeight: number, before = 0, after = 1) {
    let pitch = Math.max(1, rowHeight);
    let start = Math.max(0, Math.floor(Math.max(0, top) / pitch) - before);
    let count = Math.ceil(height / pitch) + before + after;
    return { start, end: start + count, count };
}

export function revealRow(top: number, height: number, rowHeight: number, index: number, bottomInset = 0) {
    let rowTop = index * rowHeight;
    if (rowTop < top) return rowTop;
    if (rowTop + rowHeight > top + height - bottomInset) return rowTop + rowHeight - height + bottomInset;
    return top;
}
