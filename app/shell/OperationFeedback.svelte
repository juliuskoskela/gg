<script lang="ts">
    import { onDestroy } from "svelte";
    import { operationState } from "../operations";
    import { workspaceController } from "../workspace/state";
    import Icon from "../controls/Icon.svelte";
    let visible = $state(false);
    let timer: ReturnType<typeof setTimeout> | undefined;
    $effect.pre(() => {
        clearTimeout(timer);
        let state = $operationState;
        visible = !!state && state.phase !== "pending";
        if (state?.phase === "pending") timer = setTimeout(() => visible = true, 500);
        else if (state?.phase === "succeeded" || state?.phase === "cancelled") timer = setTimeout(() => visible = false, 5000);
    });
    onDestroy(() => clearTimeout(timer));
</script>

<div class="operation-announcement" class:inspection={$workspaceController.presentation === "full" || !!$workspaceController.routedTool} role="status" aria-live="polite" aria-atomic="true">
    {#if visible && $operationState && $operationState.phase !== "failed"}
        <div class="operation-feedback" data-phase={$operationState.phase}>
            <Icon name={$operationState.phase === "succeeded" ? "check" : $operationState.phase === "cancelled" ? "x" : "clock"} />
            <span>{$operationState.label}{ $operationState.phase === "pending" ? "…" : $operationState.phase === "cancelled" ? " — cancelled" : ` — ${$operationState.detail ?? "complete"}`}</span>
            <button type="button" aria-label="Dismiss operation status" onclick={() => visible = false}><Icon name="x" /></button>
        </div>
    {/if}
</div>

<style>
    .operation-announcement { position: fixed; z-index: 85; inset-block-start: max(8px, env(safe-area-inset-top)); inset-inline-end: 12px; max-width: min(480px, calc(100vw - 24px)); pointer-events: none; }
    .operation-announcement.inspection { inset-block-start: auto; inset-block-end: max(8px, env(safe-area-inset-bottom)); }
    :global(body:has(.operation-announcement.inspection .operation-feedback) .full-inspection), :global(body:has(.operation-announcement.inspection .operation-feedback) .tool-host.destination) { inset-block-end: 64px; }
    .operation-feedback { display: flex; align-items: center; gap: 8px; min-height: 44px; padding-inline: 12px 4px; background: var(--raised); color: var(--text); border: 1px solid var(--border); border-radius: var(--radius-control); box-shadow: var(--shadow-overlay); font-size: var(--type-ui); pointer-events: auto; }
    span { min-width: 0; overflow-wrap: anywhere; }
    button { display: grid; place-items: center; flex-shrink: 0; width: 44px; height: 44px; border: 0; color: var(--muted); background: transparent; cursor: pointer; }
</style>
