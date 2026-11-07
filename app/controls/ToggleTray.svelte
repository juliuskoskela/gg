<script lang="ts">
    // "switch" picks one of its items; "multi" holds independent toggles. both draw the same way,
    // and the mode keeps the meaning for whoever reads the markup.
    // size only changes rhythm, never colour, so trays of different sizes still read as one family.
    export let label: string;
    export let size: "sm" | "md" = "sm";
    export let mode: "switch" | "multi" = "switch";
    export let role: "group" | "toolbar" = "group";
</script>

<div class="tray {size} {mode}" {role} aria-label={label}><slot /></div>

<style>
    /* no frame: an outline around transparent segments reads as a dark well next to the lit one.
       segments sit close together and only the chosen or pressed one carries a pill of the theme's ink,
       so the control belongs to whatever surface it sits on, in every family and appearance. */
    .tray {
        display: inline-flex; align-items: stretch; flex-shrink: 0; gap: 2px;
        background: transparent;
    }
    .tray > :global(.toggle) { border-radius: var(--radius-control); }
    .tray.sm { --toggle-height: var(--panel-control-size); }
    .tray.md { --toggle-height: 32px; }
    @media (pointer: coarse), (max-width: 600px) { .tray.sm, .tray.md { --toggle-height: var(--touch-target); } }
</style>
