<script lang="ts">
    export let context: boolean;
    export let target: boolean;
    export let disconnected: boolean = false;
    export let immobile: boolean = false;
    export let tip: string = "";
</script>

<div class="chip" class:context class:target class:disconnected class:immobile title={tip}>
    <slot />
</div>

<style>
    .chip {
        pointer-events: auto;

        font-family: var(--stack-ui);
        font-size: var(--type-ui);

        min-height: 22px;
        line-height: 1.25;

        display: flex;
        align-items: center;
        border: 1px solid var(--rule);
        border-radius: var(--radius-sm);
        padding: 0 6px;
        background: transparent;
        white-space: nowrap;
        gap: 4px;
    }

    .context {
        color: inherit;
        border-color: var(--control);
    }

    .target {
        outline: 2px solid var(--text);
        outline-offset: -2px;
        border-radius: var(--radius-control);
        color: var(--text);
    }

    .disconnected {
        border-style: dashed;
    }

    .immobile {
        border-style: none;
    }
</style>
