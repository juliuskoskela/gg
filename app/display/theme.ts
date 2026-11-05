import { derived, get, writable } from "svelte/store";
import { repoConfigEvent } from "../stores";

export type Theme = "light" | "dark";
export let themeStorageKey = "gg.ui.theme";
export function parseTheme(value: unknown): Theme | null {
    return value === "light" || value === "dark" ? value : null;
}

export function createThemePreference(options: { read: () => unknown; save: (value: Theme) => void }) {
    let initial: Theme | null = null;
    try { initial = parseTheme(options.read()); } catch { /* storage may be unavailable */ }
    let preference = writable<Theme | null>(initial);
    return {
        subscribe: preference.subscribe,
        set(value: Theme) {
            preference.set(value);
            try { options.save(value); } catch { /* retain the choice in this window */ }
        },
        sync(value: unknown) { preference.set(parseTheme(value)); },
    };
}

export let themePreference = createThemePreference({
    read: () => localStorage.getItem(themeStorageKey),
    save: value => localStorage.setItem(themeStorageKey, value),
});
let system = writable<Theme>("light");
if (typeof window !== "undefined") {
    let media = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (media) {
        system.set(media.matches ? "dark" : "light");
        media.addEventListener("change", event => system.set(event.matches ? "dark" : "light"));
    }
    window.addEventListener("storage", event => {
        if (event.key === themeStorageKey || event.key === null) themePreference.sync(event.key === null ? null : event.newValue);
    });
}
export let effectiveTheme = derived([themePreference, repoConfigEvent, system], ([$preference, $config, $system]) =>
    $preference ?? ($config.type === "Workspace" ? parseTheme($config.theme_override) : null) ?? $system,
);
export function toggleTheme() { themePreference.set(get(effectiveTheme) === "dark" ? "light" : "dark"); }
