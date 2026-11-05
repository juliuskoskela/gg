import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/svelte";
import { get } from "svelte/store";
import { currentSource, currentTarget } from "../stores";
import { operationState } from "../operations";
import { clearDrag, clearPendingDrop, pendingDropSource, pendingDropTarget } from "./dropLifecycle";
import Zone from "../objects/Zone.svelte";
import type { Operand } from "../messages/Operand";

let action = vi.hoisted(() => ({ allowed: true, resolve: undefined as ((result: boolean) => void) | undefined, calls: 0 }));
vi.mock("../mutators/BinaryMutator", () => ({ default: class {
    canDrop() { return { type: action.allowed ? "yes" : "no" }; }
    doDrop() { action.calls++; return new Promise<boolean>(resolve => { action.resolve = resolve; }); }
} }));

let from: Operand = { type: "Workspace", name: "from" };
let to: Operand = { type: "Repository" };
afterEach(() => { cleanup(); clearDrag(); clearPendingDrop(); operationState.set(null); action.allowed = true; action.calls = 0; });

function mount() {
    let rendered = render(Zone, { operand: to });
    let zone = rendered.container.querySelector<HTMLElement>(".zone")!;
    currentSource.set(from);
    return { ...rendered, zone };
}

describe("drop lifecycle", () => {
    it("retains source and destination while backend work is pending, including native dragend", async () => {
        let { zone } = mount();
        await fireEvent.dragOver(zone);
        expect(get(currentTarget)).toBe(to);
        await fireEvent.drop(zone);
        expect(action.calls).toBe(1);
        expect(get(pendingDropSource)).toBe(from);
        expect(get(pendingDropTarget)).toBe(to);
        expect(zone.dataset.dropState).toBe("pending");
        await fireEvent(window, new Event("dragend"));
        expect(get(pendingDropSource)).toBe(from);
        expect(get(pendingDropTarget)).toBe(to);
        action.resolve!(true);
        await expect.poll(() => get(pendingDropTarget)).toBeNull();
        expect(get(pendingDropSource)).toBeNull();
    });

    it("clears transient destinations for cancellation or leaving the app and rejects forbidden drops", async () => {
        let { zone } = mount();
        await fireEvent.dragOver(zone);
        await fireEvent.keyDown(window, { key: "Escape" });
        expect(get(currentSource)).toBeNull();
        expect(get(currentTarget)).toBeNull();
        currentSource.set(from);
        await fireEvent.dragOver(zone);
        await fireEvent(window, new Event("blur"));
        expect(get(currentTarget)).toBeNull();
        currentSource.set(from);
        action.allowed = false;
        await fireEvent.drop(zone);
        expect(action.calls).toBe(0);
        expect(get(pendingDropTarget)).toBeNull();
    });

    it("clears pending markers on failure and destination unmount without replaying a mutation", async () => {
        let { zone, unmount } = mount();
        await fireEvent.drop(zone);
        action.resolve!(false);
        await expect.poll(() => get(pendingDropTarget)).toBeNull();
        currentSource.set(from);
        await fireEvent.drop(zone);
        expect(get(pendingDropTarget)).toBe(to);
        unmount();
        expect(get(pendingDropTarget)).toBeNull();
        expect(get(pendingDropSource)).toBeNull();
        action.resolve!(true);
        expect(action.calls).toBe(2);
    });

    it("prevents a second drop while another repository mutation is pending", async () => {
        let { zone } = mount();
        operationState.set({ id: 1, label: "Move revisions", phase: "pending" });
        await fireEvent.drop(zone);
        expect(action.calls).toBe(0);
        expect(get(currentSource)).toBeNull();
    });
});
