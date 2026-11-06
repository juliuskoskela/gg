<script lang="ts" context="module">
    export interface Selection {
        from: number;
        to: number;
    }

    export interface List {
        getSize(): number;
        getSelection(): Selection;
        selectRow(row: number): void;
        extendSelection(row: number): void;
        editRow(row: number): void;
        // optional scattered selection: Ctrl+arrows move without clearing it, Ctrl+Space toggles, Escape clears
        moveFocus?(row: number): void;
        toggleRow?(row: number): void;
        clearToggled?(): boolean;
    }
</script>

<script lang="ts">
    import { onMount } from "svelte";

    import type { Operand } from "../messages/Operand";
    import { currentSource } from "../stores";

    // chromium autoscrolls overflow containers during html5 drags, webkit doesn't
    let dragScrollEnabled = !navigator.userAgent.includes("Chrome/");
    let dragScrollBand = 30;
    let dragScrollSpeed = 1000;

    interface $$Slots {
        default: {};
    }

    export let rowHeight = 30;
    export let list: List;
    export let type: Operand["type"];
    export let descendant: string | undefined = undefined;
    export let clientHeight = 0;
    export let clientWidth = 0;
    export let scrollTop = 0;
    export let scrollPaddingBottom = 0;

    $: activedescendant = descendant ? `${type}-${descendant}` : undefined;
    let box: HTMLElement;
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
        if (list.getSize() == 0) {
            return;
        }

        let selection: Selection;
        let minIdx: number;
        let maxIdx: number;
        let pageRows: number;
        switch (event.key) {
            case "ArrowUp":
                event.preventDefault();
                selection = list.getSelection();
                if ((event.ctrlKey || event.metaKey) && !event.shiftKey && list.moveFocus) {
                    if (selection.to > 0) list.moveFocus(selection.to - 1);
                } else if (event.shiftKey) {
                    if (selection.to > 0) {
                        onExtend(selection.to - 1);
                    }
                } else {
                    minIdx = Math.min(selection.from, selection.to);
                    if (minIdx > 0) {
                        onSelect(minIdx - 1);
                    }
                }
                break;

            case "ArrowDown":
                event.preventDefault();
                selection = list.getSelection();
                if ((event.ctrlKey || event.metaKey) && !event.shiftKey && list.moveFocus) {
                    if (selection.to != -1 && list.getSize() > selection.to + 1) list.moveFocus(selection.to + 1);
                } else if (event.shiftKey) {
                    if (selection.to != -1 && list.getSize() > selection.to + 1) {
                        onExtend(selection.to + 1);
                    }
                } else {
                    maxIdx = Math.max(selection.from, selection.to);
                    if (maxIdx != -1 && list.getSize() > maxIdx + 1) {
                        onSelect(maxIdx + 1);
                    }
                }
                break;

            case "PageUp":
                event.preventDefault();
                selection = list.getSelection();
                minIdx = Math.min(selection.from, selection.to);
                pageRows = Math.round(box.clientHeight / rowHeight);
                minIdx = Math.max(minIdx - pageRows, 0);
                onSelect(minIdx);
                break;

            case "PageDown":
                event.preventDefault();
                selection = list.getSelection();
                maxIdx = Math.max(selection.from, selection.to);
                pageRows = Math.round(box.clientHeight / rowHeight);
                maxIdx = Math.min(maxIdx + pageRows, list.getSize() - 1);
                onSelect(maxIdx);
                break;

            case " ":
                if ((event.ctrlKey || event.metaKey) && list.toggleRow) {
                    event.preventDefault();
                    selection = list.getSelection();
                    if (selection.to != -1) list.toggleRow(selection.to);
                }
                break;

            case "Escape":
                if (list.clearToggled?.()) event.preventDefault();
                break;

            case "Home":
                event.preventDefault();
                onSelect(0);
                break;

            case "End":
                event.preventDefault();
                onSelect(list.getSize() - 1);
                break;

            case "Enter":
                selection = list.getSelection();
                if (selection.from == selection.to) {
                    list.editRow(selection.from);
                }
        }
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
        let y = index * rowHeight;
        if (box.scrollTop + box.clientHeight - scrollPaddingBottom < y + rowHeight) {
            box.scrollTo({
                left: 0,
                top: y - box.clientHeight + scrollPaddingBottom + rowHeight,
                behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
            });
        } else if (box.scrollTop > y) {
            box.scrollTo({
                left: 0,
                top: y,
                behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
            });
        }
    }
</script>

<!-- capture phase, because zones stop propagation -->
<svelte:window
    on:dragenter|capture={onDragMove}
    on:dragover|capture={onDragMove}
    on:drop|capture={onDragFinish}
    on:dragend|capture={onDragFinish}
    on:mousemove={onDragFinish} />

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
    on:keydown={onKeyDown}>
    <slot />
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
