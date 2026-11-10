<!--
@component
Core component for direct-manipulation objects. A drag&drop source.
-->

<script lang="ts">
    import { type Snippet, onDestroy } from "svelte";
    import { pendingDropSource, clearDrag } from "../motion/dropLifecycle";
    import { mutationPending } from "../operations";
    import type { Operand } from "../messages/Operand";
    import { setCommandOperand } from "../commands/context";
    import { executeOperandCommand } from "../commands/registry";
    import { currentContext, currentSource, selectionHeaders, pickedRevisions, hasMenu, ignoreToggled } from "../stores";
    import { get } from "svelte/store";
    import BinaryMutator from "../mutators/BinaryMutator";

    interface Props {
        tabIndex?: number;
        /** "option" in a list; a tree supplies "treeitem" with its level */
        role?: "option" | "treeitem";
        level?: number | undefined;
        setSize?: number | undefined;
        position?: number | undefined;
        suffix?: string | null;
        label: string;
        selected?: boolean;
        conflicted: boolean;
        operand: Operand | null;
        defaultCommand?: string | null;
        onClick?: (event: MouseEvent) => void;
        onDoubleClick?: (event: MouseEvent) => void;
        children?: Snippet<[{ context: boolean; hint: string | null }]>;
    }

    let {
        tabIndex = -1,
        role = "option",
        level = undefined,
        setSize = undefined,
        position = undefined,
        suffix = null,
        label,
        selected = false,
        conflicted,
        operand,
        defaultCommand = null,
        onClick,
        onDoubleClick,
        children
    }: Props = $props();

    let id = $derived(suffix == null ? null : operand == null ? null : `${operand.type}-${suffix}`);
    let dragging = $state(false);
    let dragHint: string | null = $state(null);

    function handleClick(event: MouseEvent) {
        if ((event.target as Element).closest("button.selection-item") !== event.currentTarget) return;
        setCommandOperand(getEffectiveOperand());
        onClick?.(event);
    }

    function handleDoubleClick(event: MouseEvent) {
        // a default command consumes the event, so it doesn't also reach the revision underneath
        if (defaultCommand && operand) {
            event.preventDefault();
            event.stopPropagation();
            executeOperandCommand(operand, defaultCommand);
        } else {
            onDoubleClick?.(event);
        }
    }

    function getEffectiveOperand(): Operand | null {
        if (operand?.type == "Revision") {
            let picks = get(pickedRevisions);
            if (picks.some((h) => h.id.commit.hex === operand.header.id.commit.hex)) return { type: "Revisions", headers: picks };
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

            // the in-app menu is used everywhere; native menus can't carry the app's styling or symbols
            let mouseEvent = event as MouseEvent;
            hasMenu.set({ x: mouseEvent.clientX, y: mouseEvent.clientY });
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

    let inContext = $derived(isInContext($currentContext, operand));
    let inSource = $derived(isInSource($currentSource, operand) || isInSource($pendingDropSource, operand));
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
    {role}
    aria-level={level}
    aria-label={label}
    title={label}
    aria-selected={selected}
    aria-setsize={setSize}
    aria-posinset={position}
    onclick={handleClick}
    ondblclick={handleDoubleClick}
    oncontextmenu={onMenu}
    ondragstart={onDragStart}
    ondragend={onDragEnd}>
    {@render children?.({ context: dragging || inContext || inSource, hint: dragHint, })}
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
