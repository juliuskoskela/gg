<script lang="ts">
    interface Props {
        label: string;
        expanded: boolean;
        side?: "leading" | "trailing";
        controls?: string | undefined;
        text?: string;
        stacked?: boolean;
        onToggle: () => void;
        disabled?: boolean;
    }

    let {
        label,
        expanded,
        side = "leading",
        controls = undefined,
        text = "",
        stacked = false,
        onToggle,
        disabled = false
    }: Props = $props();
</script>

<button type="button" class="panel-toggle" class:stacked {disabled} aria-label={label} aria-expanded={expanded} aria-controls={controls} title={label} onclick={onToggle}>
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
