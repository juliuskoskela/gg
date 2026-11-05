import { afterEach, expect, it, vi } from "vitest";
import { render } from "@testing-library/svelte";
import { get } from "svelte/store";
import DisplayZoom from "./DisplayZoom.svelte";
import { nativeZoomEnabled } from "./zoom";

afterEach(() => vi.unstubAllGlobals());

it("leaves browser zoom shortcuts to the browser", () => {
    vi.stubGlobal("isTauri", false);
    let view = render(DisplayZoom);
    let event = new KeyboardEvent("keydown", { key: "+", ctrlKey: true, cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(get(nativeZoomEnabled)).toBe(false);
    expect(view.queryByRole("status")).toBeNull();
    view.unmount();
});
