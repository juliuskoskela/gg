<script lang="ts">
    import type { Snippet } from "svelte";
    import Icon from "./Icon.svelte";

    interface Props {
        open?: boolean;
        title: string;
        side?: "leading" | "trailing";
        id?: string | undefined;
        onClose: () => void;
        children?: Snippet;
    }

    let {
        open = false,
        title,
        side = "leading",
        id = undefined,
        onClose,
        children
    }: Props = $props();
    let dialog = $state<HTMLDialogElement>();

    $effect(() => {
        if (dialog) {
            if (open && !dialog.open) dialog.showModal();
            else if (!open && dialog.open) dialog.close();
        }
    });
</script>

<!-- native dialog supplies focus containment, escape, and focus restoration. -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<dialog {id} bind:this={dialog} class:trailing={side === "trailing"} aria-label={title} onclose={onClose} onclick={event => { if (event.target === dialog) dialog?.close(); }}>
    <div class="drawer-content">
        <header><h2>{title}</h2><button type="button" aria-label={`Close ${title.toLowerCase()}`} onclick={() => dialog?.close()}><Icon name="x" /></button></header>
        <div class="drawer-body">{@render children?.()}</div>
    </div>
</dialog>

<style>
    dialog { position: fixed; inset: 0; margin: 0; padding: 0; border: 0; width: 100%; max-width: none; height: 100%; max-height: none; background: transparent; color: var(--text); overflow: hidden; pointer-events: auto; }
    dialog::backdrop { background: var(--scrim); }
    .drawer-content { pointer-events: auto; width: min(320px, calc(100% - 32px)); height: 100%; display: flex; flex-direction: column; background: var(--surface); border-inline-end: 1px solid var(--rule); box-shadow: var(--shadow-overlay); padding-block: env(safe-area-inset-top) env(safe-area-inset-bottom); }
    .trailing .drawer-content { margin-inline-start: auto; border-inline-end: 0; border-inline-start: 1px solid var(--rule); }
    header { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 52px; padding: 8px 12px; border-block-end: 1px solid var(--rule); }
    h2 { margin: 0; font-size: var(--type-ui); font-weight: 500; }
    button { display: grid; place-items: center; width: 36px; min-height: 36px; border: 0; border-radius: var(--radius-control); background: transparent; color: var(--text); cursor: pointer; }
    .drawer-body { pointer-events: auto; padding: 12px; overflow: auto; overscroll-behavior: contain; min-height: 0; flex: 1; }
    @media (hover: hover) { button:hover { background: var(--hover); color: var(--text); } }
    button:active { background: var(--control-pressed); }
    @media (pointer: coarse), (max-width: 600px) { button { width: 44px; min-height: 44px; } }
</style>
