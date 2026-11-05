<script lang="ts">
    import sprite from "feather-icons/dist/feather-sprite.svg";
    export let name: string;
    export let state: "add" | "change" | "remove" | null = null;
</script>

<svg
    aria-hidden="true"
    focusable="false"
    class="feather"
    class:add={state == "add"}
    class:change={state == "change"}
    class:remove={state == "remove"}
    viewBox="0 0 24 24">
    <use href="{sprite}#{name}" />
</svg>

<style>
    .feather {
        pointer-events: none;
        height: var(--icon-size);
        width: var(--icon-size);
        flex-shrink: 0;
        fill: none;
        stroke: currentColor;
        stroke-linecap: round;
        stroke-linejoin: round;
        stroke-width: var(--icon-stroke);
    }

    .add {
        stroke: var(--positive);
    }

    .change {
        color: var(--text);
    }

    .remove {
        color: var(--negative);
    }
</style>
