<!--
@component
A drop target for direct-manipulation objects.
-->

<script lang="ts">
    import { onDestroy, onMount } from "svelte";
    import { mutationPending } from "../operations";
    import { clearDrag, clearPendingDrop, pendingDropSource, pendingDropTarget, watchDragCancellation } from "../motion/dropLifecycle";
    import type { Operand } from "../messages/Operand";
    import BinaryMutator from "../mutators/BinaryMutator";
    import { currentSource, currentTarget, ignoreToggled } from "../stores";

    interface $$Slots {
        default: { target: boolean; hint: string | null };
    }

    export let operand: Operand | null;
    export let alwaysTarget: boolean = false;

    let dropHint: string | null = null;
    let target = false;
    $: target = match($currentTarget) || match($pendingDropTarget);
    let zone: HTMLDivElement;
    let disposed = false;
    let dropping = false;
    $: if (!$currentSource && !dropping) dropHint = null;
    onMount(watchDragCancellation);

    function match(target: Operand | null): boolean {
        return (
            (operand && target == operand) ||
            (operand?.type == "Merge" && target?.type == "Merge" && operand.header.id.commit == target.header.id.commit)
        );
    }

    function onDragOver(event: DragEvent) {
        event.stopPropagation();

        if ($mutationPending || dropping) return;
        let canDrop =
            operand == null || $currentSource == null
                ? { type: "no", hint: "" }
                : new BinaryMutator($currentSource!, operand, $ignoreToggled).canDrop();

        if (canDrop.type == "yes") {
            event.preventDefault();
            if (!match($currentTarget)) {
                $currentTarget = operand;
            }
            dropHint = null;
        } else if (canDrop.type == "maybe") {
            event.preventDefault();
            dropHint = canDrop.hint;
            if (alwaysTarget && !match($currentTarget)) {
                $currentTarget = operand;
            }
        } else {
            if (match($currentTarget)) $currentTarget = null;
            dropHint = null;
        }
    }

    function onDragLeave(event: DragEvent) {
        if (event.relatedTarget instanceof Node && zone.contains(event.relatedTarget)) return;
        if (match($currentTarget)) $currentTarget = null;
        dropHint = null;
    }

    async function onDrop(event: DragEvent) {
        event.stopPropagation();
        event.preventDefault();
        if (dropping || $mutationPending || !operand || !$currentSource) { clearDrag(); return; }
        let mutator = new BinaryMutator($currentSource, operand, $ignoreToggled);
        if (mutator.canDrop().type !== "yes") { clearDrag(); dropHint = null; return; }
        dropping = true;
        pendingDropSource.set($currentSource);
        pendingDropTarget.set(operand);
        dropHint = "Applying operation…";
        clearDrag();
        try {
            // global OperationFeedback owns confirmed result and error announcements.
            await mutator.doDrop();
        } finally {
            dropping = false;
            dropHint = null;
            if (!disposed) clearPendingDrop();
        }
    }
    onDestroy(() => {
        disposed = true;
        if (match($currentTarget)) $currentTarget = null;
        if (match($pendingDropTarget)) clearPendingDrop();
    });

</script>

<div
    bind:this={zone}
    role="presentation"
    class="zone"
    data-drop-state={dropping ? "pending" : target ? "target" : undefined}
    class:hint={dropHint}
    on:dragenter={onDragOver}
    on:dragover={onDragOver}
    on:dragleave={onDragLeave}
    on:drop={onDrop}>
    <slot {target} hint={dropHint} />
</div>

<style>
    .zone {
        width: 100%;
        pointer-events: auto;
    }

    .hint {
        color: var(--warning);
    }
</style>
