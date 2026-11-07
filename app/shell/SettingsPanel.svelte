<script lang="ts">
    import { effectiveTheme, effectiveAppearance, setAppearance, useDefaultAppearance, themePreference } from "../display/theme";
    import { appZoom, nativeZoomEnabled, zoomCommands } from "../display/zoom";
    import { mutationPending } from "../operations";
    import { currentMutation, ignoreToggled, repoStatusEvent } from "../stores";
    import ToggleWidget from "../controls/ToggleWidget.svelte";
    import ThemeFamilyPicker from "../display/ThemeFamilyPicker.svelte";
    import Icon from "../controls/Icon.svelte";

    $: busy = !!$currentMutation || $mutationPending;
    $: zoom = zoomCommands($appZoom, $nativeZoomEnabled);
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex (settings scroll independently of the dock) -->
<div class="settings-panel" role="region" aria-label="Settings preferences" tabindex="0">
    <div class="settings-content">
        <section aria-labelledby="appearance-heading">
            <h2 id="appearance-heading">Appearance</h2>
            <ThemeFamilyPicker />
            <div class="setting-row appearance-row">
                <div class="setting-copy"><h3>Light level</h3><p>Choose a light workspace or one of two dark depths.</p></div>
                <div class="theme-choices" role="group" aria-label="Appearance">
                    <button type="button" aria-pressed={$effectiveAppearance === "light"} on:click={() => setAppearance("light")}><Icon name="sun" />Light</button>
                    <button type="button" aria-pressed={$effectiveAppearance === "twilight"} on:click={() => setAppearance("twilight")}><Icon name="sunset" />Twilight</button>
                    <button type="button" aria-pressed={$effectiveAppearance === "midnight"} on:click={() => setAppearance("midnight")}><Icon name="moon" />Midnight</button>
                </div>
            </div>
            <div class="appearance-default"><button type="button" on:click={useDefaultAppearance} disabled={$themePreference === null}>Use repository or system appearance</button>{#if $themePreference === null}<span>Automatic · {$effectiveTheme === "light" ? "Light" : $effectiveAppearance === "twilight" ? "Twilight" : "Midnight"}</span>{/if}</div>
        </section>
        <section aria-labelledby="zoom-heading">
            <h2 id="zoom-heading">{$nativeZoomEnabled ? "App zoom" : "Browser zoom"}</h2>
            {#if $nativeZoomEnabled}
                <div class="setting-row">
                    <div class="setting-copy"><h3>Interface size</h3><p>{Math.round($appZoom.level * 100)}%{$appZoom.pending ? " · Applying…" : ""}</p></div>
                    <div class="zoom-controls" role="group" aria-label="App zoom">
                        {#each zoom as command}
                            <button type="button" aria-label={command.label} title={`${command.reason ?? command.label} (${command.shortcut})`} disabled={!!command.reason || $appZoom.pending} on:click={() => command.execute()}><Icon name={command.icon} />{#if command.id === "view.zoom-reset"}<span>100%</span>{/if}</button>
                        {/each}
                    </div>
                </div>
            {:else}
                <p class="browser-hint">Use your browser’s Zoom menu or <kbd>Ctrl/⌘ +</kbd> and <kbd>Ctrl/⌘ −</kbd> to change the interface size. Reset with <kbd>Ctrl/⌘ 0</kbd>.</p>
            {/if}
        </section>
        <section aria-labelledby="protection-heading">
            <h2 id="protection-heading">Repository protection</h2>
            <div class="setting-row protection" class:overriding={$ignoreToggled}>
                <div class="setting-copy"><h3 id="immutability-label">Override immutability</h3><p>Allow edits to revisions marked immutable.</p></div>
                <ToggleWidget tip="Override immutability" bind:checked={$ignoreToggled} disabled={busy} safe on="shield-off" off="shield" />
            </div>
        </section>
        <section aria-labelledby="operation-heading">
            <h2 id="operation-heading">Current operation</h2>
            <p class="operation-description">{$repoStatusEvent?.operation_description ?? "No operation"}</p>
        </section>
    </div>
</div>

<style>
    .settings-panel { min-width: 0; min-height: 0; height: 100%; overflow: auto; overscroll-behavior: contain; scroll-padding-block: 20px; pointer-events: auto; color: var(--text); background: var(--surface); }
    .settings-content { max-width: 720px; padding: 8px 20px 24px; }
    section { padding-block: 20px; }
    section + section { border-block-start: 1px solid var(--rule); }
    h2 { margin: 0 0 var(--gap-group); color: var(--text-strong); font: var(--font-heading); }
    h3 { margin: 0; color: var(--text); font: var(--font-emphasis); }
    p { max-width: var(--prose-measure); margin: 2px 0 0; color: var(--muted); font: var(--font-label); overflow-wrap: anywhere; }
    .setting-row { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px 20px; }
    .appearance-row { margin-block-start: 20px; }
    .appearance-default { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-block-start: 12px; color: var(--muted); font: var(--font-label); }
    .appearance-default button { border-color: transparent; padding-inline: 0; color: var(--muted); font-size: var(--type-caption); text-align: start; white-space: normal; }
    .setting-copy { flex: 1 1 200px; }
    .theme-choices, .zoom-controls { display: flex; align-items: center; gap: 4px; }
    button { display: inline-flex; align-items: center; justify-content: center; gap: var(--control-gap); min-height: var(--control-height); min-width: var(--control-height); padding: 5px 10px; border: 1px solid var(--border); border-radius: var(--radius-control); color: var(--text); background: transparent; font-size: var(--type-ui); cursor: pointer; }
    button[aria-pressed="true"] { background: var(--interaction-selected, var(--selection-bg)); color: var(--text); }
    @media (hover: hover) { button:not(:disabled):hover { background: var(--interaction-hover, var(--hover)); } button[aria-pressed="true"]:hover { background: var(--interaction-selected-hover, var(--selection-hover)); } }
    button:not(:disabled):active { background: var(--interaction-pressed, var(--control-pressed)); }
    button[aria-pressed="true"]:active { background: var(--interaction-selected-pressed, var(--active)); }
    button:disabled { color: var(--text-disabled); cursor: default; }
    .overriding h3 { color: var(--warning); }
    .browser-hint { margin: 0; max-width: 62ch; }
    kbd { white-space: nowrap; font: inherit; color: var(--text); }
    .operation-description { margin: 0; user-select: text; }
    @media (pointer: coarse), (max-width: 600px) { button { min-height: 44px; min-width: 44px; } .settings-content { padding-inline: 16px; } }
</style>
