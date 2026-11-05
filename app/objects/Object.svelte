<!--
@component
Core component for direct-manipulation objects. A drag&drop source.
-->

<script lang="ts">
    import { onDestroy } from "svelte";
    import { pendingDropSource, clearDrag } from "../motion/dropLifecycle";
    import { mutationPending } from "../operations";
    import type { Operand } from "../messages/Operand";
    import { setCommandOperand } from "../commands/context";
    import { executeOperandCommand } from "../commands/registry";
    import { trigger, isTauri } from "../ipc";
    import { currentContext, currentSource, selectionHeaders, hasMenu, ignoreToggled } from "../stores";
    import { createEventDispatcher } from "svelte";
    import { get } from "svelte/store";
    import BinaryMutator from "../mutators/BinaryMutator";

    interface $$Slots {
        default: { context: boolean; hint: string | null };
    }

    interface $$Events {
        click: CustomEvent<MouseEvent>;
        dblclick: CustomEvent<MouseEvent>;
    }

    export let tabIndex = -1;
    export let setSize: number | undefined = undefined;
    export let position: number | undefined = undefined;
    export let suffix: string | null = null;
    export let label: string;
    export let selected: boolean = false;
    export let conflicted: boolean;
    export let operand: Operand | null;
    export let defaultCommand: string | null = null;

    let dispatch = createEventDispatcher();

    let id = suffix == null ? null : operand == null ? null : `${operand.type}-${suffix}`;
    let dragging: boolean;
    let dragHint: string | null = null;

    function onClick(event: MouseEvent) {
        if ((event.target as Element).closest("button.selection-item") !== event.currentTarget) return;
        setCommandOperand(getEffectiveOperand());
        dispatch("click", event);
    }

    function onDoubleClick(event: MouseEvent) {
        // a default command consumes the event, so it doesn't also reach the revision underneath
        if (defaultCommand && operand) {
            event.preventDefault();
            event.stopPropagation();
            executeOperandCommand(operand, defaultCommand);
        } else {
            dispatch("dblclick", event);
        }
    }

    function getEffectiveOperand(): Operand | null {
        if (operand?.type == "Revision") {
            let headers = get(selectionHeaders);
            if (
                headers &&
                headers.length > 1 &&
                headers.some((h) => h.id.commit.hex === operand.header.id.commit.hex)
            ) {
                return { type: "Revisions", headers };
            }
        }

        return operand;
    }

    function onMenu(event: Event) {
        if (
            operand?.type == "Ref" ||
            operand?.type == "Change" ||
            operand?.type == "Revision" ||
            operand?.type == "Workspace"
        ) {
            event.preventDefault();
            event.stopPropagation();

            let effectiveOperand = getEffectiveOperand();
            currentContext.set(effectiveOperand);
            setCommandOperand(effectiveOperand);

            let mouseEvent = event as MouseEvent;
            if (isTauri()) {
                trigger("forward_context_menu", {
                    context: effectiveOperand,
                    x: mouseEvent.clientX,
                    y: mouseEvent.clientY,
                });
            } else {
                hasMenu.set({ x: mouseEvent.clientX, y: mouseEvent.clientY });
            }
        }
    }

    function onDragStart(event: DragEvent) {
        if ($mutationPending) { event.preventDefault(); return; }
        currentContext.set(null);
        event.stopPropagation();

        let effectiveOperand = getEffectiveOperand();
        let canDrag =
            effectiveOperand == null
                ? { type: "no", hint: "" }
                : new BinaryMutator(effectiveOperand, null, $ignoreToggled).canDrag();

        if (canDrag.type == "no") {
            event.preventDefault();
            return;
        } else {
            event.dataTransfer?.setData("text/plain", ""); // if we need more than one drag to be active, this could store a key
            $currentSource = effectiveOperand; // it would've been nice to just put this in the drag data but chrome says That's Insecure
            dragging = true;

            if (canDrag.type == "maybe") {
                dragHint = canDrag.hint;
                let empty = document.createElement("div");
                event.dataTransfer?.setDragImage(empty, 0, 0);
            }
        }
    }

    function onDragEnd() {
        clearDrag();
        dragging = false;
        dragHint = null;
    }

    // check if this operand is part of the current context
    function isInContext(ctx: Operand | null, op: Operand | null): boolean {
        if (!ctx || !op) return false;
        if (ctx === op) return true;
        if (ctx.type === "Revisions" && op.type === "Revision") {
            return ctx.headers.some((h) => h.id.commit.hex === op.header.id.commit.hex);
        }
        return false;
    }

    // check if this operand is part of the current drag source
    function isInSource(src: Operand | null, op: Operand | null): boolean {
        if (!src || !op) return false;
        if (src === op) return true;
        if (src.type === "Revisions" && op.type === "Revision") {
            return src.headers.some((h) => h.id.commit.hex === op.header.id.commit.hex);
        }
        return false;
    }

    $: inContext = isInContext($currentContext, operand);
    $: inSource = isInSource($currentSource, operand) || isInSource($pendingDropSource, operand);
    onDestroy(() => { if (dragging) clearDrag(); });
</script>

<button
    {id}
    class="selection-item"
    class:selected
    class:conflict={conflicted}
    class:context={dragging || inContext || inSource}
    class:hint={dragHint}
    tabindex={tabIndex}
    draggable={operand != null}
    role="option"
    aria-label={label}
    title={label}
    aria-selected={selected}
    aria-setsize={setSize}
    aria-posinset={position}
    on:click={onClick}
    on:dblclick={onDoubleClick}
    on:contextmenu={onMenu}
    on:dragstart={onDragStart}
    on:dragend={onDragEnd}>
    <slot context={dragging || inContext || inSource} hint={dragHint} />
</button>

<style>
    button {
        /* reset button styles */
        background: transparent;
        border: none;
        margin: 0;
        padding: 0;
        color: inherit;
        text-align: start;

        width: 100%;
        display: flex;
        align-items: center;
    }

    button[draggable="true"] {
        cursor: grab;
    }

    .conflict { color: var(--negative); --selection-text: var(--negative); }
    .context { background: var(--selection-bg); }

    .hint {
        color: var(--warning);
    }
</style>
