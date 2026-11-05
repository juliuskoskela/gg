<script lang="ts">
    import { dragOverWidget, hasModal } from "../stores";

    export let tip: string = "";
    export let onClick: (event: MouseEvent) => void;
    export let isStatic = false;
    export let safe: boolean = false;
    export let secondary: boolean = false;
    export let primary: boolean = false;
    export let disabled: boolean = false;

    $: isDisabled = disabled || (!safe && $hasModal);
</script>

<button
    type="button"
    disabled={isDisabled}
    class:static={isStatic}
    class:safe
    class:secondary
    class:primary
    on:click|stopPropagation={isDisabled ? undefined : onClick}
    on:dragenter={dragOverWidget}
    on:dragover={dragOverWidget}
    title={tip}
    aria-label={tip || undefined}>
    <slot />
</button>

<style>
    @import "./action.css";
    @import "./action-primary.css";
</style>
