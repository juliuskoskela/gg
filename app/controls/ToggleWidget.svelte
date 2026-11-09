<script lang="ts">
    import { dragOverWidget, hasModal } from "../stores";
    import Icon from "./Icon.svelte";

    interface Props {
        tip?: string;
        checked: boolean;
        isStatic?: boolean;
        safe?: boolean;
        secondary?: boolean;
        primary?: boolean;
        disabled?: boolean;
        on: string;
        off: string;
    }

    let {
        tip = "",
        checked = $bindable(),
        isStatic = false,
        safe = false,
        secondary = false,
        primary = false,
        disabled = false,
        on,
        off
    }: Props = $props();

    let isDisabled = $derived(disabled || (!safe && $hasModal));

    function toggle() {
        if (!isDisabled) {
            checked = !checked;
        }
    }
</script>

<button
    type="button"
    disabled={isDisabled}
    aria-pressed={checked}
    class:static={isStatic}
    class:safe
    class:secondary
    class:primary
    class:checked
    onclick={toggle}
    ondragenter={dragOverWidget}
    ondragover={dragOverWidget}
    title={tip}
    aria-label={tip || undefined}>
    <Icon name={checked ? on : off} />
</button>

<style>
    @import "./action.css";
    @import "./action-primary.css";
    button.checked:not(:disabled) { background: var(--selection-bg); border-color: var(--border); color: var(--selection-text); }
    @media (hover: hover) { button.checked:not(:disabled):hover { background: var(--selection-hover); border-color: var(--control); } }
    button.checked:not(:disabled):active { background: var(--control-pressed); }
</style>
