<script lang="ts">
    // the tray is a flat pill; items fill it edge to edge and light up when on.
    // "switch" picks one of its items, so the lit side reads as a position.
    // "multi" holds independent toggles; without an outline they read as separate buttons, not one choice.
    // size only changes rhythm, never colour, so trays of different sizes still read as one family.
    export let label: string;
    export let size: "sm" | "md" = "sm";
    export let mode: "switch" | "multi" = "switch";
    export let role: "group" | "toolbar" = "group";
</script>

<div class="tray {size} {mode}" {role} aria-label={label}><slot /></div>

<style>
    .tray {
        position: relative;
        display: inline-flex; align-items: stretch; flex-shrink: 0;
        border-radius: var(--radius-control);
        /* clips the segments to the pill, so items need no radius of their own */
        overflow: hidden;
        background: transparent;
    }
    /* drawn above the segments, so a lit segment keeps the pill's edge instead of bleeding into the surface */
    .tray::after {
        content: ""; position: absolute; inset: 0; pointer-events: none;
        border-radius: inherit;
        border: 1px solid var(--border);
    }
    .tray.sm { --toggle-height: var(--panel-control-size); }
    .tray.md { --toggle-height: 32px; }
    @media (pointer: coarse), (max-width: 600px) { .tray.sm, .tray.md { --toggle-height: var(--touch-target); } }

    .tray.multi { gap: 2px; overflow: visible; }
    .tray.multi::after { content: none; }
    .tray.multi > :global(.toggle) { border-radius: var(--radius-control); }

    @media (forced-colors: active) {
        .tray::after { border-color: CanvasText; }
    }
</style>
