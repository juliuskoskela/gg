<script lang="ts">

    interface Props {
        // a native checkbox drawn in the theme's ink, so selection never brings in a system accent
        checked: boolean;
        indeterminate?: boolean;
        label: string;
        onChange: () => void;
    }

    let {
        checked,
        indeterminate = false,
        label,
        onChange
    }: Props = $props();
</script>

<input class="note-check" type="checkbox" aria-label={label} {checked} {indeterminate} onchange={onChange} onclick={event => event.stopPropagation()} />

<style>
    .note-check {
        appearance: none; display: grid; place-content: center; flex: none;
        width: 16px; height: 16px; margin: 0;
        border: var(--line-width) solid var(--line-control); border-radius: var(--radius-control);
        background: transparent; cursor: pointer;
    }
    /* the tick is a glyph, not a line; --line-glyph tells e2e/line-audit.test.ts so */
    .note-check::after { content: ""; width: 8px; height: 4px; --line-glyph: tick;
        /* design-token-allow line: the tick is a glyph drawn with two borders, not a line */
        border: solid var(--surface);
        /* design-token-allow line: the tick's stroke weight, matched to the icon set */
        border-width: 0 0 1.75px 1.75px; transform: translateY(-1px) rotate(-45deg); opacity: 0; }
    .note-check:checked, .note-check:indeterminate { border-color: transparent; background: var(--text); }
    .note-check:checked::after { opacity: 1; }
    .note-check:indeterminate::after { width: 8px; height: 0;
        /* design-token-allow line: the dash is a glyph stroke matched to the tick */
        border-width: 0 0 1.75px; transform: none; opacity: 1; }
    @media (hover: hover) { .note-check:not(:checked):not(:indeterminate):hover { border-color: var(--control-hover); } }
    .note-check:focus-visible { outline: var(--focus-width) solid var(--focus-ring); outline-offset: 2px; }
    @media (pointer: coarse), (max-width: 600px) { .note-check { width: 22px; height: 22px; } .note-check::after { width: 10px; height: 5px; } }
    @media (forced-colors: active) { .note-check { appearance: auto; } .note-check::after { content: none; } }
</style>
