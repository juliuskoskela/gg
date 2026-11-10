/** where a file browser sits next to the content it belongs to */
export type PaneSide = "left" | "right" | "top" | "bottom";

export let PANE_SIDES: readonly PaneSide[] = ["left", "right", "top", "bottom"];
export let PANE_KEY_STEP = 24;
export let SIDE_LABELS: Record<PaneSide, string> = { left: "Left", right: "Right", top: "Top", bottom: "Bottom" };

export function isHorizontal(side: PaneSide): boolean {
    return side === "left" || side === "right";
}

export function minPaneSize(side: PaneSide): number {
    return isHorizontal(side) ? 180 : 120;
}

/** the largest the pane may be in a view this wide (left, right) or tall (top, bottom), never below the minimum */
export function maxPaneSize(side: PaneSide, view: number): number {
    return Math.max(minPaneSize(side), Math.floor(view * (isHorizontal(side) ? 0.5 : 0.7)));
}

export function clampPaneSize(side: PaneSide, size: number, view: number, fallback: number): number {
    if (!Number.isFinite(size)) return fallback;
    return Math.min(maxPaneSize(side, view), Math.max(minPaneSize(side), Math.round(size)));
}

/** the stored side, with the older "start" and "end" read as left and right */
export function parseSide(value: unknown, fallback: PaneSide): PaneSide {
    if (value === "start") return "left";
    if (value === "end") return "right";
    return PANE_SIDES.includes(value as PaneSide) ? value as PaneSide : fallback;
}

/** the sidebar icon only shows a pane on the left, so the other sides turn it */
export function placementTransform(side: PaneSide): string {
    if (side === "right") return "scaleX(-1)";
    if (side === "top") return "rotate(90deg)";
    if (side === "bottom") return "rotate(-90deg)";
    return "";
}
