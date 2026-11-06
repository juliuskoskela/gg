<script lang="ts">
    import Icon from "./Icon.svelte";
    // one item inside a ToggleTray.
    // kind decides the aria contract: "pressed" for toggles and segments, "disclosure" for panels,
    // "menu" for a trigger whose icon mirrors the choice made in its popup.
    export let on = false;
    export let kind: "pressed" | "disclosure" | "menu" = "pressed";
    export let label: string | undefined = undefined;
    export let tip: string | undefined = label;
    export let icon: string | undefined = undefined;
    export let text: string | undefined = undefined;
    export let controls: string | undefined = undefined;
    export let disabled = false;
    export let element: HTMLButtonElement | undefined = undefined;
    export let onClick: () => void = () => {};
</script>

<button
    type="button"
    class="toggle"
    class:on
    class:icon-only={!text}
    bind:this={element}
    {disabled}
    aria-label={label}
    title={tip}
    aria-pressed={kind === "pressed" ? on : undefined}
    aria-expanded={kind !== "pressed" ? on : undefined}
    aria-haspopup={kind === "menu" ? "menu" : undefined}
    aria-controls={controls}
    on:click={onClick}
    on:keydown>
    {#if icon}<Icon name={icon} />{/if}
    {#if text}<span>{text}</span>{/if}
    {#if kind === "menu"}<span class="caret"><Icon name="chevron-down" /></span>{/if}
</button>

<style>
    .toggle {
        position: relative;
        display: inline-flex; align-items: center; justify-content: center; gap: 5px;
        min-width: var(--toggle-height, 28px); min-height: var(--toggle-height, 28px); padding: 0 12px;
        border: 0; border-radius: 0;
        background: transparent; color: var(--text);
        font: 500 var(--type-caption)/1 var(--stack-ui); white-space: nowrap;
        cursor: pointer; --icon-size: 16px;
        transition: none;
        -webkit-tap-highlight-color: transparent;
    }
    .toggle.icon-only { min-width: var(--toggle-height, 28px); padding: 0 6px; }
    .caret { display: inline-flex; margin-inline-start: -3px; --icon-size: 10px; }

    .toggle.on { background: var(--active); color: var(--text-strong); }

    @media (hover: hover) {
        .toggle:not(:disabled):hover { background: var(--hover); color: var(--text-strong); }
        .toggle.on:not(:disabled):hover { background: var(--active-hover); }
    }
    .toggle:not(:disabled):active,
    .toggle.on:not(:disabled):active { background: var(--control-pressed); }

    /* inset, since the tray clips anything drawn outside it */
    .toggle:focus-visible { outline: none; }
    .toggle:focus-visible::before {
        content: ""; position: absolute; inset: 3px; pointer-events: none;
        border: var(--focus-width) solid var(--focus-ring); border-radius: var(--radius-control);
    }
    .toggle:disabled { color: var(--text-disabled); cursor: default; }

    @media (forced-colors: active) {
        .toggle.on { background: Highlight; color: HighlightText; forced-color-adjust: none; }
        .toggle:focus-visible::before { border-color: CanvasText; }
        .toggle.on:focus-visible::before { border-color: HighlightText; }
        .toggle:disabled { color: GrayText; }
    }
</style>
