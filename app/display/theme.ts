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

export type ThemeFamily = "cold" | "neutral" | "warm";
export type DarkDepth = "twilight" | "midnight";
export type Appearance = "light" | DarkDepth;
export let themeFamilies: { id: ThemeFamily; label: string; description: string }[] = [
    { id: "cold", label: "Cold", description: "Blue slate" },
    { id: "neutral", label: "Neutral", description: "Balanced gray" },
    { id: "warm", label: "Warm", description: "Soft charcoal" },
];
export let themeFamilyStorageKey = "gg.ui.theme.family";
export let darkDepthStorageKey = "gg.ui.theme.dark-depth";
export function parseThemeFamily(value: unknown): ThemeFamily | null { return value === "cold" || value === "neutral" || value === "warm" ? value : null; }
export function parseDarkDepth(value: unknown): DarkDepth | null { return value === "twilight" || value === "midnight" ? value : null; }
export function createColorPreference<T>(options: { read: () => unknown; save: (value: T) => void; parse: (value: unknown) => T | null; fallback: T }) {
    let initial = options.fallback;
    try { initial = options.parse(options.read()) ?? options.fallback; } catch { /* use the established appearance */ }
    let preference = writable<T>(initial);
    return {
        subscribe: preference.subscribe,
        set(value: T) { let valid = options.parse(value); if (valid === null) return; preference.set(valid); try { options.save(valid); } catch { /* retain this session's choice */ } },
        sync(value: unknown) { preference.set(options.parse(value) ?? options.fallback); },
    };
}
export let themeFamily = createColorPreference({ read: () => localStorage.getItem(themeFamilyStorageKey), save: (value: ThemeFamily) => localStorage.setItem(themeFamilyStorageKey, value), parse: parseThemeFamily, fallback: "warm" as ThemeFamily });
export let darkDepth = createColorPreference({ read: () => localStorage.getItem(darkDepthStorageKey), save: (value: DarkDepth) => localStorage.setItem(darkDepthStorageKey, value), parse: parseDarkDepth, fallback: "twilight" as DarkDepth });
export let effectiveAppearance = derived([effectiveTheme, darkDepth], ([$theme, $depth]): Appearance => $theme === "light" ? "light" : $depth);
export function setAppearance(value: Appearance) {
    if (value !== "light") darkDepth.set(value);
    themePreference.set(value === "light" ? "light" : "dark");
}
export function useDefaultAppearance() {
    try { localStorage.removeItem(themeStorageKey); } catch { /* choice still changes in this window */ }
    themePreference.sync(null);
}
if (typeof window !== "undefined") window.addEventListener("storage", event => {
    if (event.key === themeFamilyStorageKey || event.key === null) themeFamily.sync(event.key === null ? null : event.newValue);
    if (event.key === darkDepthStorageKey || event.key === null) darkDepth.sync(event.key === null ? null : event.newValue);
});

if (typeof document !== "undefined") derived([themeFamily, darkDepth, effectiveTheme], ([$family, $depth, $mode]) => ({ family: $family, depth: $depth, mode: $mode })).subscribe(({ family, depth, mode }) => {
    document.documentElement.dataset.themeFamily = family;
    document.documentElement.dataset.darkDepth = depth;
    document.documentElement.style.colorScheme = mode;
});
