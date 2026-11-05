<script lang="ts">
    import { dragOverWidget, hasModal } from "../stores";
    import Icon from "./Icon.svelte";

    export let tip: string = "";
    export let checked: boolean;
    export let isStatic = false;
    export let safe: boolean = false;
    export let secondary: boolean = false;
    export let primary: boolean = false;
    export let disabled: boolean = false;
    export let on: string;
    export let off: string;

    $: isDisabled = disabled || (!safe && $hasModal);

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
    on:click={toggle}
    on:dragenter={dragOverWidget}
    on:dragover={dragOverWidget}
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
