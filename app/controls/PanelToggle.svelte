<script lang="ts">
    export let label: string;
    export let expanded: boolean;
    export let side: "leading" | "trailing" = "leading";
    export let controls: string | undefined = undefined;
    export let text = "";
    export let stacked = false;
    export let onToggle: () => void;
    export let disabled = false;
</script>

<button type="button" class="panel-toggle" class:stacked {disabled} aria-label={label} aria-expanded={expanded} aria-controls={controls} title={label} on:click={onToggle}>
    <svg viewBox="0 0 24 24" aria-hidden="true" class:trailing={side === "trailing"}>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M9 4v16" />
        {#if expanded}<path class="panel-fill" d="M4 5h4v14H4z" />{/if}
    </svg>
    {#if text}<span>{text}</span>{/if}
</button>

<style>
    @import "./action.css";
    svg { width: var(--icon-size); height: var(--icon-size); fill: none; stroke: currentColor; stroke-width: var(--icon-stroke); stroke-linecap: round; stroke-linejoin: round; }
    button.stacked { flex-direction: column; justify-content: center; gap: var(--space-1); min-height: var(--control-height); height: auto; padding: 6px 2px; font-size: var(--type-ui); line-height: 1.2; }
    .stacked svg { width: 16px; height: 16px; }
    .stacked span { display: none; }
    .panel-fill { fill: currentColor; opacity: .25; stroke: none; }
    svg.trailing { transform: scaleX(-1); }
    :global([dir="rtl"]) svg { transform: scaleX(-1); }
    :global([dir="rtl"]) svg.trailing { transform: none; }
    @media (pointer: coarse), (max-width: 600px) { button, button.stacked { min-height: var(--touch-target); min-width: var(--touch-target); } }
</style>
