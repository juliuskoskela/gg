import { afterEach, expect, it } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/svelte";
import { get } from "svelte/store";
import SettingsPanel from "./SettingsPanel.svelte";
import { themePreference } from "../display/theme";
import { appZoom, nativeZoomEnabled } from "../display/zoom";
import { currentMutation, ignoreToggled, repoStatusEvent } from "../stores";

afterEach(() => {
    cleanup(); nativeZoomEnabled.set(false); themePreference.sync(null); ignoreToggled.set(false); currentMutation.set(null);
    localStorage.removeItem("gg.ui.theme");
});

it("saves explicit light and dark choices and explains browser zoom", async () => {
    themePreference.set("light");
    let view = render(SettingsPanel);
    expect(view.getByRole("button", { name: "Light", pressed: true })).toBeTruthy();
    await fireEvent.click(view.getByRole("button", { name: "Dark" }));
    expect(view.getByRole("button", { name: "Dark", pressed: true })).toBeTruthy();
    expect(localStorage.getItem("gg.ui.theme")).toBe("dark");
    expect(view.getByRole("heading", { name: "Browser zoom" })).toBeTruthy();
    expect(view.queryByRole("group", { name: "App zoom" })).toBeNull();
    themePreference.sync(localStorage.getItem("gg.ui.theme"));
    expect(get(themePreference)).toBe("dark");
    await fireEvent.click(view.getByRole("button", { name: "Light" }));
    expect(localStorage.getItem("gg.ui.theme")).toBe("light");
});

it("exposes native zoom commands and live operation/protection independently of a revision", async () => {
    nativeZoomEnabled.set(true);
    repoStatusEvent.set({ operation_description: "describe test revision", working_copy: { type: "CommitId", hex: "abc", prefix: "a", rest: "bc" }, can_redo: false });
    let view = render(SettingsPanel);
    expect(view.getByRole("group", { name: "App zoom" })).toBeTruthy();
    expect(view.getByRole("button", { name: "Zoom in · 100%" })).toBeTruthy();
    expect(view.getByRole("button", { name: "Zoom out · 100%" })).toBeTruthy();
    expect(view.getByRole("button", { name: "Actual size · 100%" })).toBeTruthy();
    expect(get(appZoom).level).toBe(1);
    expect(view.getByText("describe test revision")).toBeTruthy();
    let protection = view.getByRole("button", { name: "Override immutability" });
    await fireEvent.click(protection);
    expect(get(ignoreToggled)).toBe(true);
    currentMutation.set({ type: "wait" });
    await waitFor(() => expect((protection as HTMLButtonElement).disabled).toBe(true));
});
