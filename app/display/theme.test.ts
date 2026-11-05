import { describe, expect, it, vi } from "vitest";
import { get } from "svelte/store";
import { createThemePreference, parseTheme } from "./theme";

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
