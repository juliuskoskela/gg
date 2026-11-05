import { describe, expect, it, vi } from "vitest";
import { get } from "svelte/store";
import { createZoomController, validZoom, zoomCommands, zoomShortcut } from "./zoom";

describe("native app zoom", () => {
    it("restores valid settings and falls back safely for malformed, out-of-range, and unavailable storage", async () => {
        let saved: unknown = 1.5;
        let apply = vi.fn(async (_level: number) => {});
        let save = vi.fn();
        let zoom = createZoomController({ apply, read: () => saved, save });
        await zoom.restore();
        expect(get(zoom)).toEqual({ level: 1.5, pending: false, error: null });
        for (let value of ["1.5", null, NaN, Infinity, 0.79, 2.01]) {
            saved = value;
            await zoom.restore();
            expect(get(zoom).level).toBe(1);
        }
        expect(validZoom(.8)).toBe(.8);
        expect(validZoom(2)).toBe(2);
        let unavailable = createZoomController({ apply, read: () => { throw new Error("storage"); }, save });
        await unavailable.restore();
        expect(get(unavailable).level).toBe(1);
        expect(save).not.toHaveBeenCalled();
    });

    it("serializes in-flight updates and applies and saves only the latest queued request", async () => {
        let release!: () => void;
        let gate = new Promise<void>(resolve => { release = resolve; });
        let applied: number[] = [];
        let save = vi.fn();
        let zoom = createZoomController({ apply: async level => { applied.push(level); if (level === 1.25) await gate; }, read: () => 1, save });
        let first = zoom.set(1.25);
        await Promise.resolve();
        expect(applied).toEqual([1.25]);
        let skipped = zoom.set(1.5);
        let last = zoom.set(2);
        expect(get(zoom)).toEqual({ level: 2, pending: true, error: null });
        release();
        await Promise.all([first, skipped, last]);
        expect(applied).toEqual([1.25, 2]);
        expect(save.mock.calls).toEqual([[2]]);
        expect(get(zoom)).toEqual({ level: 2, pending: false, error: null });
    });

    it("does not persist a failed apply and permits recovery", async () => {
        let apply = vi.fn(async (level: number) => { if (level === 1.5) throw new Error("webview unavailable"); });
        let save = vi.fn();
        let zoom = createZoomController({ apply, read: () => 1, save });
        await zoom.set(1.25);
        await zoom.set(1.5);
        expect(save.mock.calls).toEqual([[1.25]]);
        expect(get(zoom)).toEqual({ level: 1.25, pending: false, error: "Couldn’t change app zoom. Try again." });
        await zoom.reset();
        expect(get(zoom)).toEqual({ level: 1, pending: false, error: null });
        expect(save.mock.calls).toEqual([[1.25], [1]]);
    });

    it("recognizes modified zoom keys and exposes commands only in native mode", () => {
        let key = (key: string, ctrlKey = true, metaKey = false, altKey = false) => ({ key, ctrlKey, metaKey, altKey });
        expect(zoomShortcut(key("+"))).toBe("view.zoom-in");
        expect(zoomShortcut(key("=", false, true))).toBe("view.zoom-in");
        expect(zoomShortcut(key("-"))).toBe("view.zoom-out");
        expect(zoomShortcut(key("0", false, true))).toBe("view.zoom-reset");
        expect(zoomShortcut(key("+", false))).toBeNull();
        expect(zoomShortcut(key("+", true, false, true))).toBeNull();
        expect(zoomShortcut(key("a"))).toBeNull();
        let state = { level: 2, pending: false, error: null };
        expect(zoomCommands(state, false)).toEqual([]);
        let commands = zoomCommands(state, true);
        expect(commands.map(command => command.id)).toEqual(["view.zoom-in", "view.zoom-out", "view.zoom-reset"]);
        expect(commands[0].reason).toBe("Maximum app zoom");
        expect(commands[0].label).toContain("200%");
        expect(zoomCommands({ ...state, level: .8 }, true)[1].reason).toBe("Minimum app zoom");
    });
});
