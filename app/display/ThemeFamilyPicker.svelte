<script lang="ts">
    import { themeFamily, themeFamilies, darkDepth, effectiveTheme, colorVision } from "./theme";
    import Icon from "../controls/Icon.svelte";
</script>

<div class="family-picker" role="group" aria-label="Color family">
    {#each themeFamilies as family}
        <button type="button" aria-label={family.label} aria-describedby={`theme-family-${family.id}-description`} aria-pressed={$themeFamily === family.id} onclick={() => themeFamily.set(family.id)}>
            <span class="preview" data-theme-preview data-theme-family={family.id} data-dark-depth={$darkDepth} data-color-vision={$colorVision} style:color-scheme={$effectiveTheme} aria-hidden="true"><span class="preview-rail"></span><span class="preview-document"><i></i><i></i><i></i><i></i></span><span class="preview-note"><i></i><i></i></span></span>
            <span class="family-label"><span>{family.label}</span>{#if $themeFamily === family.id}<Icon name="check" />{/if}</span>
            <span class="family-description" id={`theme-family-${family.id}-description`}>{family.description}</span>
        </button>
    {/each}
</div>

<style>
    @import "../controls/action.css";
    .family-picker { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; width: 100%; pointer-events: auto; }
    button { display: flex; flex-direction: column; align-items: stretch; gap: 0; min-width: 0; padding: 6px; border: 1px solid var(--rule); border-radius: var(--radius-control); white-space: normal; text-align: start; }
    button[aria-pressed=true] { border-color: var(--field-focus-border); background: var(--interaction-selected); }
    .preview { display: grid; grid-template-columns: 11% 57% 32%; height: 66px; overflow: hidden; background: var(--palette-ground); border-radius: 3px; pointer-events: none; }
    .preview-rail { background: var(--palette-ground); border-inline-end: 1px solid color-mix(in srgb, var(--palette-text) 10%, transparent); }
    .preview-document { display: flex; flex-direction: column; gap: 5px; padding: 11px 9px; background: var(--palette-surface); }
    .preview-note { display: flex; flex-direction: column; gap: 5px; padding: 11px 6px; background: var(--palette-raised); }
    i { display: block; width: 80%; height: 3px; border-radius: 2px; background: var(--palette-muted); opacity: .65; }
    .preview-document i:first-child { width: 60%; background: var(--palette-accent); opacity: 1; }
    .preview-document i:nth-child(3) { width: 60%; }
    .preview-note i:last-child { width: 60%; }
    .family-label { display: flex; justify-content: space-between; align-items: center; gap: 4px; margin: 9px 4px 2px; font-weight: 500; --icon-size: 13px; }
    .family-description { margin: 0 4px 5px; font-size: var(--type-caption); color: var(--muted); }
    @media (max-width: 380px) { .family-picker { gap: 6px; } .family-description { display: none; } .preview { height: 48px; } button { padding: 4px; } .family-label { margin-inline: 2px; } }
</style>
