<script lang="ts">
    import type { Snippet } from "svelte";
    import { onMount } from "svelte";

    interface Props {
        title: string;
        error?: boolean;
        children?: Snippet;
        commands?: Snippet;
        onCancel?: () => void;
        onDefault?: () => void;
    }

    let {
        title,
        error = false,
        children,
        commands,
        onCancel,
        onDefault
    }: Props = $props();

    let dialog!: HTMLDivElement;
    let previous: HTMLElement | null;

    function focusable() {
        return [...dialog.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])')].filter(element => element.getClientRects().length > 0);
    }

    onMount(() => {
        previous = document.activeElement as HTMLElement | null;
        (focusable()[0] ?? dialog).focus();
        document.addEventListener("keydown", onKeyDown);
        return () => {
            document.removeEventListener("keydown", onKeyDown);
            if (previous?.isConnected) previous.focus();
        };
    });

    function onKeyDown(event: KeyboardEvent) {
        if (event.defaultPrevented || event.isComposing) return;
        if (event.key === "Escape") {
            event.preventDefault();
            onCancel?.();
        } else if (event.key === "Tab") {
            let items = focusable();
            let index = items.indexOf(document.activeElement as HTMLElement);
            if (!items.length) { event.preventDefault(); dialog.focus(); }
            else if (event.shiftKey && index <= 0) { event.preventDefault(); items[items.length - 1].focus(); }
            else if (!event.shiftKey && (index < 0 || index === items.length - 1)) { event.preventDefault(); items[0].focus(); }
        } else if (event.key === "Enter" && event.target instanceof HTMLInputElement && !["checkbox", "radio", "button", "submit"].includes(event.target.type)) {
            event.preventDefault();
            onDefault?.();
        }
    }
</script>

<div id="dialog-chrome" bind:this={dialog} tabindex="-1" role="dialog" aria-modal="true" aria-labelledby="dialog-header">
    <h3 id="dialog-header" class:error>{title}</h3>

    <div id="dialog-content">
        {@render children?.()}
    </div>

    <div id="dialog-commands">
        {@render commands?.()}
    </div>
</div>

<style>
    #dialog-chrome { grid-area: 2/2/2/2; display: grid; grid-template-columns: minmax(0, 1fr); grid-template-rows: auto auto auto; width: min(560px, calc(100vw - 32px)); max-height: calc(100dvh - 80px); overflow-y: auto; overscroll-behavior: contain; background: var(--raised); border-radius: var(--radius-surface); border: 1px solid var(--border); box-shadow: var(--shadow-overlay); padding: 24px; gap: 20px; pointer-events: auto; }
    #dialog-header { margin: 0; color: var(--text-strong); font: var(--font-heading); }
    #dialog-content { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: 12px; font: var(--font-body); min-width: 0; }
    #dialog-content > :global(p) { grid-column: 1 / -1; margin: 0; max-width: var(--prose-measure); overflow-wrap: anywhere; }
    #dialog-content :global(input), #dialog-content :global(select) { width: 100%; min-width: 0; min-height: var(--control-height); font-family: var(--stack-ui); font-size: var(--type-ui); }
    #dialog-content :global(code) { font: var(--font-id); overflow-wrap: anywhere; }
    #dialog-commands { display: flex; align-items: center; justify-content: flex-end; gap: 8px; }
    .error { color: var(--negative); }
    @media (max-width: 600px) { #dialog-chrome { padding: 20px; } #dialog-content { grid-template-columns: minmax(0, 1fr); } }
    @media (pointer: coarse), (max-width: 600px) { #dialog-content :global(input), #dialog-content :global(select) { min-height: 44px; font-size: max(16px, 1rem); } }
</style>
