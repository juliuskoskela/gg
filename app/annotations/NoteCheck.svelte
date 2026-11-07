<script lang="ts">
    // a native checkbox drawn in the theme's ink, so selection never brings in a system accent
    export let checked: boolean;
    export let indeterminate = false;
    export let label: string;
    export let onChange: () => void;
</script>

<input class="note-check" type="checkbox" aria-label={label} {checked} {indeterminate} on:change={onChange} on:click|stopPropagation />

<style>
    .note-check {
        appearance: none; display: grid; place-content: center; flex: none;
        width: 16px; height: 16px; margin: 0;
        border: 1.5px solid color-mix(in srgb, var(--text) 38%, transparent); border-radius: 4px;
        background: transparent; cursor: pointer;
    }
    .note-check::after { content: ""; width: 8px; height: 4px; border: solid var(--surface); border-width: 0 0 1.75px 1.75px; transform: translateY(-1px) rotate(-45deg); opacity: 0; }
    .note-check:checked, .note-check:indeterminate { border-color: var(--text); background: var(--text); }
    .note-check:checked::after { opacity: 1; }
    .note-check:indeterminate::after { width: 8px; height: 0; border-width: 0 0 1.75px; transform: none; opacity: 1; }
    @media (hover: hover) { .note-check:not(:checked):not(:indeterminate):hover { border-color: color-mix(in srgb, var(--text) 65%, transparent); } }
    .note-check:focus-visible { outline: var(--focus-width) solid var(--focus-ring); outline-offset: 2px; }
    @media (pointer: coarse), (max-width: 600px) { .note-check { width: 22px; height: 22px; } .note-check::after { width: 10px; height: 5px; } }
    @media (forced-colors: active) { .note-check { appearance: auto; } .note-check::after { content: none; } }
</style>
