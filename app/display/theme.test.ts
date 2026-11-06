import { describe, expect, it, vi } from "vitest";
import { get } from "svelte/store";
import { createThemePreference, parseTheme, createColorPreference, parseThemeFamily, parseDarkDepth, type ThemeFamily } from "./theme";

describe("appearance preference", () => {
    it("restores only recognized values and synchronizes changes from other windows", () => {
        let save = vi.fn();
        let preference = createThemePreference({ read: () => "dark", save });
        expect(get(preference)).toBe("dark");
        preference.set("light");
        expect(save).toHaveBeenCalledWith("light");
        preference.sync("dark");
        expect(get(preference)).toBe("dark");
        preference.sync(null);
        expect(get(preference)).toBeNull();
        expect(parseTheme("system")).toBeNull();
    });
    it("continues to work if storage is blocked", () => {
        let preference = createThemePreference({ read: () => { throw new Error("blocked"); }, save: () => { throw new Error("blocked"); } });
        expect(get(preference)).toBeNull();
        preference.set("dark");
        expect(get(preference)).toBe("dark");
    });
});


describe("color family and dark depth", () => {
    it("rejects unknown values, restores a family, and synchronizes storage resets", () => {
        let save = vi.fn();
        let preference = createColorPreference<ThemeFamily>({ read: () => "cold", save, parse: parseThemeFamily, fallback: "warm" });
        expect(get(preference)).toBe("cold"); preference.set("neutral"); expect(save).toHaveBeenCalledWith("neutral");
        preference.sync("warm"); expect(get(preference)).toBe("warm"); preference.sync("unknown"); expect(get(preference)).toBe("warm");
        expect(parseThemeFamily("dark")).toBeNull(); expect(parseDarkDepth("midnight")).toBe("midnight"); expect(parseDarkDepth("light")).toBeNull();
    });
    it("retains the selected family if storage is blocked", () => {
        let preference = createColorPreference<ThemeFamily>({ read: () => { throw new Error("blocked"); }, save: () => { throw new Error("blocked"); }, parse: parseThemeFamily, fallback: "warm" });
        expect(get(preference)).toBe("warm"); preference.set("cold"); expect(get(preference)).toBe("cold");
    });
});
