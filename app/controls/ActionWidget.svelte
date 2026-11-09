<script lang="ts">
    import type { Snippet } from "svelte";
    import { dragOverWidget, hasModal } from "../stores";

    interface Props {
        tip?: string;
        onClick: (event: MouseEvent) => void;
        isStatic?: boolean;
        safe?: boolean;
        secondary?: boolean;
        primary?: boolean;
        disabled?: boolean;
        disabledReason?: string;
        children?: Snippet;
    }

    let {
        tip = "",
        onClick,
        isStatic = false,
        safe = false,
        secondary = false,
        primary = false,
        disabled = false,
        disabledReason = "",
        children
    }: Props = $props();

    let isDisabled = $derived(disabled || (!safe && $hasModal));
</script>

<button
    type="button"
    disabled={isDisabled}
    class:static={isStatic}
    class:safe
    class:secondary
    class:primary
    onclick={event => { event.stopPropagation(); if (!isDisabled) onClick(event); }}
    ondragenter={dragOverWidget}
    ondragover={dragOverWidget}
    title={isDisabled && disabledReason ? disabledReason : tip}
    aria-label={tip || undefined}>
    {@render children?.()}
</button>

<style>
    @import "./action.css";
    @import "./action-primary.css";
</style>
