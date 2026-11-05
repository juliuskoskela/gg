<script lang="ts">
    import { onDestroy, tick } from "svelte";

    export let columns: HTMLElement[] = [];
    let tracks: HTMLDivElement[] = [];
    let widths: number[] = [];
    let overflowing: boolean[] = [];
    let disconnect = () => {};
    let destroyed = false;

    $: connect(columns);
    async function connect(codeColumns: HTMLElement[]) {
        disconnect();
        await tick();
        if (destroyed || codeColumns !== columns) return;
        function measure() {
            widths = codeColumns.map((code, i) => Math.max(0, code.scrollWidth - code.clientWidth) + (tracks[i]?.clientWidth ?? 0));
            overflowing = codeColumns.map(code => code.scrollWidth > code.clientWidth);
        }
        let observer = new ResizeObserver(measure);
        let cleanups = codeColumns.map((code, i) => {
            function sync() { if (tracks[i]) tracks[i].scrollLeft = code.scrollLeft; }
            code.addEventListener("scroll", sync, { passive: true });
            observer.observe(code);
            if (tracks[i]) observer.observe(tracks[i]);
            let content = code.querySelector("[data-content]");
            if (content) observer.observe(content);
            return () => code.removeEventListener("scroll", sync);
        });
        measure();
        disconnect = () => { observer.disconnect(); cleanups.forEach(cleanup => cleanup()); };
    }
    onDestroy(() => { destroyed = true; disconnect(); });
</script>

<div class="diff-scrollbars" hidden={!overflowing.some(Boolean)} style={`grid-template-columns: repeat(${Math.max(1, columns.length)}, minmax(0, 1fr));`}>
    {#each columns as code, i}
        <!-- svelte-ignore a11y_no_noninteractive_tabindex (native overflow remains keyboard scrollable) -->
        <div class="horizontal-track" class:empty={!overflowing[i]} role="region" aria-label={columns.length === 1 ? "Scroll diff horizontally" : i === 0 ? "Scroll original lines horizontally" : "Scroll changed lines horizontally"} tabindex={overflowing[i] ? 0 : -1} bind:this={tracks[i]} on:scroll={event => code.scrollLeft = event.currentTarget.scrollLeft}>
            <div style={`width: ${widths[i] ?? 0}px; height: 1px;`}></div>
        </div>
    {/each}
</div>

<style>
    .diff-scrollbars { position: sticky; bottom: 0; z-index: 1; display: grid; min-width: 0; background: var(--surface); pointer-events: auto; }
    .diff-scrollbars[hidden] { display: none; }
    .horizontal-track { min-width: 0; height: 14px; overflow-x: scroll; overflow-y: hidden; pointer-events: auto; }
    .horizontal-track.empty { visibility: hidden; }
    .horizontal-track:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
    @media (pointer: coarse) { .horizontal-track { height: 16px; } }
</style>
