<script lang="ts" module>
    export type { Selection, List } from "./listNavigation";
</script>

<script lang="ts">
    import { selectionAction, revealRow, type List } from "./listNavigation";
    import { onMount, type Snippet } from "svelte";

    import type { Operand } from "../messages/Operand";
    import { currentSource } from "../stores";

    // chromium autoscrolls overflow containers during html5 drags, webkit doesn't
    let dragScrollEnabled = !navigator.userAgent.includes("Chrome/");
    let dragScrollBand = 30;
    let dragScrollSpeed = 1000;

    interface Props {
        rowHeight?: number;
        list: List;
        type: Operand["type"];
        descendant?: string | undefined;
        clientHeight?: number;
        clientWidth?: number;
        scrollTop?: number;
        scrollPaddingBottom?: number;
        children?: Snippet;
    }

    let {
        rowHeight = 30,
        list,
        type,
        descendant = undefined,
        clientHeight = $bindable(0),
        clientWidth = $bindable(0),
        scrollTop = $bindable(0),
        scrollPaddingBottom = 0,
        children
    }: Props = $props();

    let activedescendant = $derived(descendant ? `${type}-${descendant}` : undefined);
    let box!: HTMLElement;
    let pollFrame: number;
    let lastFrame: number | undefined;
    let dragPoint: { x: number; y: number } | null = null;

    onMount(() => {
        pollFrame = requestAnimationFrame(pollScroll);
        return () => {
            if (pollFrame) cancelAnimationFrame(pollFrame);
        };
    });

    function pollScroll(time: number) {
        if (box) {
            if (dragPoint && $currentSource) {
                dragScroll(Math.min(time - (lastFrame ?? time), 100));
            }
            if (box.scrollTop !== scrollTop) {
                scrollTop = box.scrollTop;
            }
            // ResizeObserver doesn't fire when a scrollbar appears/disappears
            if (box.clientWidth !== clientWidth) {
                clientWidth = box.clientWidth;
            }
        }

        lastFrame = time;
        pollFrame = requestAnimationFrame(pollScroll);
    }

    // driven by the frame loop rather than dragover, which webkit only fires when the pointer moves
    function dragScroll(elapsed: number) {
        let { x, y } = dragPoint!;
        let rect = box.getBoundingClientRect();
        if (x < rect.left || x > rect.right) {
            return;
        }

        // bands extend past the edges, so overshooting onto neighbouring elements keeps scrolling
        let band = Math.min(dragScrollBand, rect.height / 4);
        let depth = 0;
        if (y > rect.top - band && y < rect.top + band) {
            depth = -Math.min(1, (rect.top + band - y) / band);
        } else if (y > rect.bottom - band && y < rect.bottom + band) {
            depth = Math.min(1, (y - rect.bottom + band) / band);
        }

        if (depth != 0) {
            let step = Math.max(1, Math.round((Math.abs(depth) * dragScrollSpeed * elapsed) / 1000));
            box.scrollTop += Math.sign(depth) * step;
        }
    }

    function onDragMove(event: DragEvent) {
        if (dragScrollEnabled) {
            dragPoint = { x: event.clientX, y: event.clientY };
        }
    }

    // mousemove can't happen mid-drag, so it catches drags whose dragend never reached us
    function onDragFinish() {
        dragPoint = null;
    }

    function onKeyDown(event: KeyboardEvent) {
        let size = list.getSize();
        if (!size) return;
        if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End"].includes(event.key) ||
            (event.key === " " && (event.ctrlKey || event.metaKey) && list.toggleRow)) event.preventDefault();
        let action = selectionAction(event, list.getSelection(), size, Math.round(box.clientHeight / rowHeight), {
            focus: !!list.moveFocus, toggle: !!list.toggleRow, clear: !!list.clearToggled,
        });
        if (!action) return;
        switch (action.type) {
            case "clear":
                if (list.clearToggled?.()) event.preventDefault();
                return;
            case "edit":
                list.editRow(action.index);
                return;
            case "focus": list.moveFocus?.(action.index); break;
            case "toggle": list.toggleRow?.(action.index); break;
            case "extend": onExtend(action.index); break;
            case "select": onSelect(action.index); break;
        }
        event.preventDefault();
    }

    function onSelect(index: number) {
        box.focus();
        list.selectRow(index);
        scrollToRow(index);
    }

    function onExtend(index: number) {
        box.focus();
        list.extendSelection(index);
        scrollToRow(index);
    }

    function scrollToRow(index: number) {
        let top = revealRow(box.scrollTop, box.clientHeight, rowHeight, index, scrollPaddingBottom);
        if (top !== box.scrollTop) box.scrollTo({
            left: 0,
            top,
            behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
        });
    }
</script>

<!-- capture phase, because zones stop propagation -->
<svelte:window
    ondragentercapture={onDragMove}
    ondragovercapture={onDragMove}
    ondropcapture={onDragFinish}
    ondragendcapture={onDragFinish}
    onmousemove={onDragFinish} />

<ol
    class="listbox"
    role="listbox"
    aria-label="{type} List"
    aria-multiselectable="false"
    aria-activedescendant={activedescendant}
    tabindex="0"
    bind:this={box}
    bind:clientHeight
    bind:clientWidth
    onkeydown={onKeyDown}>
    {@render children?.()}
</ol>

<style>
    .listbox {
        overflow-x: hidden;
        overflow-y: auto;
        display: grid;
        outline: none;
    }

    .listbox:focus-visible {
        outline: 2px solid var(--accent);
        border-radius: var(--radius-control);
    }

</style>
