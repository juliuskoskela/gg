<script lang="ts" generics="T extends {value: string, separator?: boolean, disabled?: boolean}">
    import type { Snippet } from "svelte";
    import Icon from "./Icon.svelte";

    interface Props {
        disabled?: boolean;
        id?: string | null;
        label?: string;
        title?: string | undefined;
        options: T[];
        value: string;
        children?: Snippet<[{ option: T }]>;
        onChange?: (event: Event) => void;
    }

    let {
        disabled = false,
        id = null,
        label = "Saved revset",
        title = undefined,
        options,
        value = $bindable(),
        children,
        onChange
    }: Props = $props();

</script>

<div class="wrapper" class:disabled>
    <select {id} {disabled} {title} aria-label={label} bind:value onchange={onChange}>
        <button type="button" class="select-trigger"><selectedcontent></selectedcontent></button>
        {#each options as option}
            {#if option.separator}
                <hr class="separator" />
            {:else}
                <option selected={value == option.value} value={option.value} disabled={option.disabled}>
                    {#if children}{@render children({ option, })}{:else}{option.value}{/if}
                </option>
            {/if}
        {/each}
    </select>
    <span class="select-chevron" aria-hidden="true"><Icon name="chevron-down" /></span>
</div>

<style>
    .wrapper { position: relative; display: flex; min-width: 0; }
    select { appearance: none; -webkit-appearance: none; width: 100%; min-width: 0; min-height: var(--control-height); padding-inline-end: calc(16px + 2 * var(--control-padding-inline)); text-overflow: ellipsis; }
    .select-chevron { position: absolute; inset-inline-end: var(--control-padding-inline); inset-block: 0; display: grid; place-items: center; color: var(--muted); pointer-events: none; --icon-size: 16px; }
    .disabled .select-chevron { color: var(--text-disabled); }
    @supports (appearance: base-select) {
        select, select::picker(select) { appearance: base-select; }
        select::picker-icon { display: none; }
    }
    @media (pointer: coarse), (max-width: 600px) { select { min-height: var(--touch-target); font-size: 16px; } }
</style>
