<script lang="ts" generics="T extends {value: string, separator?: boolean}">
    import { createEventDispatcher } from "svelte";

    interface $$Slots {
        default: { option: T };
    }

    interface $$Events {
        change: CustomEvent<Event>;
    }

    export let disabled = false;
    export let id: string | null = null;
    export let label = "Saved revset";
    export let options: T[];
    export let value: string;

    let dispatch = createEventDispatcher();
</script>

<div class="wrapper">
    <select {id} {disabled} aria-label={label} bind:value on:change={(event) => dispatch("change", event)}>
        <button type="button" class="select-trigger"><selectedcontent></selectedcontent></button>
        {#each options as option}
            {#if option.separator}
                <hr class="separator" />
            {:else}
                <option selected={value == option.value} value={option.value}>
                    <slot {option}>{option.value}</slot>
                </option>
            {/if}
        {/each}
    </select>
</div>

<style>
    .wrapper { display: flex; min-width: 0; }
    select { width: 100%; min-height: var(--control-height); }
    @media (pointer: coarse), (max-width: 600px) { select { min-height: var(--touch-target); font-size: 16px; } }
</style>
