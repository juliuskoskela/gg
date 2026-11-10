<script module lang="ts">
    // folders stay open or closed per place (a repository, a revision), and a revision's changed folders open only once
    interface Remembered { expanded: Set<string>; collapsed: Set<string> }
    let memory = new Map<string, Remembered>();
    let seeded = new Set<string>();
</script>

<script lang="ts">
    import { tick, untrack, type Snippet } from "svelte";
    import type { Command } from "../commands/registry";
    import { navigationIndex, revealRow, virtualRange } from "../controls/listNavigation";
    import type { RevChange } from "../messages/RevChange";
    import { categoryOf } from "../revision/fileCategories";
    import FileRow from "./FileRow.svelte";
    import { ancestors, defaultExpanded, groupKey, visibleRows, type FileRowContext, type TreeRow } from "./fileTree";

    interface Props {
        /** files that are changed, with their changes; they are listed even when `paths` lacks them */
        changes: readonly RevChange[];
        /** every file to list; without it the tree lists the changed files */
        paths?: readonly string[];
        selectedPath?: string;
        filter?: string;
        changedOnly?: boolean;
        groupByType?: boolean;
        label: string;
        /** where folder state is remembered, such as a repository */
        memoryKey: string;
        /** the changed folders open once for each seed, such as a revision */
        seedKey: string;
        empty?: string;
        /** a host that draws its own file rows, such as one with drag and drop */
        fileRow?: Snippet<[FileRowContext]>;
        /** every file click, including unchanged files */
        onOpen?: (path: string, change?: RevChange) => void;
        onSelect?: (change: RevChange) => void;
        dirty?: ReadonlySet<string>;
        /** a right-click or the menu key on a row; folder commands are the ones only the tree can run */
        onMenu?: (row: TreeRow, at: { x: number; y: number }, folder: Command[]) => void;
    }

    let { changes, paths = undefined, selectedPath = "", filter = $bindable(""), changedOnly = $bindable(false), groupByType = false, label, memoryKey, seedKey, empty = "No files", fileRow, onOpen, onSelect, dirty, onMenu }: Props = $props();

    let files = $derived(paths ?? changes.map(change => change.path.repo_path));
    let expanded = $state.raw<Set<string>>(new Set());
    let collapsedGroups = $state.raw<Set<string>>(new Set());
    let picked = $state("");
    let active = $state(0);
    let viewport = $state<HTMLElement>();
    let height = $state(440);
    let top = $state(0);
    let rowHeight = $state(24);

    function remember() {
        memory.set(memoryKey, { expanded, collapsed: collapsedGroups });
    }
    function persist(next: Set<string>) {
        expanded = next;
        remember();
    }
    function persistGroups(next: Set<string>) {
        collapsedGroups = next;
        remember();
    }

    $effect.pre(() => {
        let place = memoryKey, seed = seedKey;
        untrack(() => {
            let saved = memory.get(place);
            expanded = saved?.expanded ?? new Set();
            collapsedGroups = saved?.collapsed ?? new Set();
            if (!seeded.has(seed)) {
                seeded.add(seed);
                persist(new Set([...expanded, ...defaultExpanded(changes)]));
            }
        });
    });
    $effect.pre(() => { picked = selectedPath; });
    // a new place starts at the top
    $effect.pre(() => {
        void memoryKey; void seedKey;
        untrack(() => { top = 0; active = 0; if (viewport) viewport.scrollTop = 0; });
    });

    let rows = $derived(visibleRows({ files, changes, expanded, filter, changedOnly, groupByType, collapsedGroups }));
    let range = $derived(virtualRange(top, height, rowHeight, 4, 4));
    let start = $derived(range.start);
    let end = $derived(Math.min(rows.length, range.end));
    let stop = $derived(Math.max(start, Math.min(active, end - 1)));
    let narrowed = $derived(filter.trim() !== "");

    function toggle(row: TreeRow) {
        if (row.kind === "group") {
            let next = new Set(collapsedGroups);
            if (!next.delete(row.path)) next.add(row.path);
            persistGroups(next);
            return;
        }
        let next = new Set(expanded);
        if (!next.delete(row.path)) next.add(row.path);
        persist(next);
    }

    function activate(row: TreeRow, index: number) {
        active = index;
        if (row.kind !== "file") { toggle(row); return; }
        picked = row.path;
        if (row.change) onSelect?.(row.change);
        onOpen?.(row.path, row.change);
    }

    async function focusRow(index: number) {
        active = index;
        top = revealRow(top, height, rowHeight, index);
        if (viewport) viewport.scrollTop = top;
        await tick();
        let item = viewport?.querySelector<HTMLElement>(`[data-index="${index}"]`);
        (item?.hasAttribute("tabindex") ? item : item?.querySelector<HTMLElement>("[tabindex]"))?.focus({ preventScroll: true });
    }

    // a selection made elsewhere is opened up to and scrolled into view, and a tree that opens on a selection shows it
    $effect(() => {
        let path = selectedPath, element = viewport;
        // rows measure after the first render, and the selection stays in view when their height settles
        void rowHeight;
        if (!path || !element) return;
        untrack(() => {
            let change = changes.find(change => change.path.repo_path === path);
            let missing = ancestors(path).filter(folder => !expanded.has(folder));
            if (missing.length && !narrowed) persist(new Set([...expanded, ...missing]));
            if (change && groupByType && collapsedGroups.has(groupKey(categoryOf(change)))) {
                let next = new Set(collapsedGroups);
                next.delete(groupKey(categoryOf(change)));
                persistGroups(next);
            }
        });
        // the space the rows fill grows with the next render, and a scroll past its old end would be cut short
        void tick().then(() => {
            if (path !== selectedPath) return;
            let index = rows.findIndex(row => row.kind === "file" && row.path === path);
            if (index < 0) return;
            active = index;
            top = revealRow(element.scrollTop, element.clientHeight || height, rowHeight, index);
            element.scrollTop = top;
        });
    });

    function parentIndex(index: number) {
        let depth = rows[index].depth;
        for (let i = index - 1; i >= 0; i--) if (rows[i].depth < depth) return i;
        return -1;
    }

    function folderCommands(row: TreeRow): Command[] {
        let prefix = `${row.path}/`;
        let commands: Command[] = [];
        if (expanded.has(row.path)) commands.push({ id: "tree.collapse", label: "Collapse", icon: "chevrons-up", scope: "File", group: 10, reason: null, execute: () => persist(new Set([...expanded].filter(path => path !== row.path && !path.startsWith(prefix)))) });
        commands.push({ id: "tree.expand-all", label: "Expand all", icon: "chevrons-down", scope: "File", group: 10, reason: null, execute: () => {
            let next = new Set(expanded);
            next.add(row.path);
            for (let file of files) if (file.startsWith(prefix)) for (let folder of ancestors(file)) if (folder.startsWith(prefix) || folder === row.path) next.add(folder);
            persist(next);
        } });
        return commands;
    }

    function openMenu(row: TreeRow, index: number, at: { x: number; y: number }) {
        active = index;
        onMenu?.(row, at, row.kind === "folder" ? folderCommands(row) : []);
    }

    // the menu key fires contextmenu without a pointer, so the menu opens at the row
    function rowMenu(event: MouseEvent, row: TreeRow, index: number) {
        if (!onMenu) return;
        event.preventDefault();
        let keyboard = event.button !== 2 && !event.ctrlKey;
        let bounds = (event.currentTarget as HTMLElement).getBoundingClientRect();
        openMenu(row, index, keyboard ? { x: bounds.left, y: bounds.bottom } : { x: event.clientX, y: event.clientY });
    }

    function keydown(event: KeyboardEvent) {
        let item = (event.target as HTMLElement).closest<HTMLElement>("[data-index]");
        if (!item || event.altKey || event.ctrlKey || event.metaKey) return;
        let index = Number(item.dataset.index);
        let row = rows[index];
        if (!row) return;
        if (onMenu && !(fileRow && row.kind === "file") && (event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey))) {
            event.preventDefault();
            let bounds = item.getBoundingClientRect();
            openMenu(row, index, { x: bounds.left, y: bounds.bottom });
            return;
        }
        if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
            let next = navigationIndex(event.key, index, rows.length);
            if (next === null) return;
            event.preventDefault();
            void focusRow(next);
        } else if (event.key === "ArrowRight") {
            if (row.kind === "file") return;
            event.preventDefault();
            if (!row.expanded) toggle(row);
            else if (rows[index + 1]?.depth > row.depth) void focusRow(index + 1);
        } else if (event.key === "ArrowLeft") {
            event.preventDefault();
            if (row.kind !== "file" && row.expanded && !narrowed) { toggle(row); return; }
            let parent = parentIndex(index);
            if (parent >= 0) void focusRow(parent);
        } else if (event.key === "Enter" || event.key === " ") {
            // a host's own file row is a button, which answers these keys itself
            if (fileRow && row.kind === "file") return;
            event.preventDefault();
            activate(row, index);
        }
    }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions (arrow keys move between tree items) -->
<div class="tree-scroll" role="tree" tabindex="-1" aria-label={label} bind:this={viewport} bind:clientHeight={height} onscroll={event => top = event.currentTarget.scrollTop} onkeydown={keydown}>
    <div class="row-measure" aria-hidden="true" bind:clientHeight={rowHeight}></div>
    <div class="tree-space" style:height={`${rows.length * rowHeight}px`}>
        {#each rows.slice(start, end) as row, i (i)}
            {@const index = start + i}
            {@const custom = !!fileRow && row.kind === "file"}
            {@const isSelected = row.kind === "file" && row.path === picked}
            {#if custom}
                <div class="tree-slot" role="none" data-index={index} data-changed={row.changed > 0 ? "" : undefined} style:top={`${index * rowHeight}px`} style:height={`${rowHeight}px`} onfocusin={() => active = index}>
                    {@render fileRow!({ row, index, selected: isSelected, tabindex: index === stop ? 0 : -1, size: rows.length, activate: () => activate(row, index) })}
                </div>
            {:else}
                <!-- svelte-ignore a11y_click_events_have_key_events (the tree handles keys) -->
                <div
                    class="tree-slot tree-row selection-item"
                    class:folder={row.kind !== "file"}
                    class:deleted={row.change?.kind === "Deleted"}
                    role="treeitem"
                    tabindex={index === stop ? 0 : -1}
                    aria-level={row.depth + 1}
                    aria-expanded={row.kind !== "file" ? !!row.expanded : undefined}
                    aria-selected={row.kind === "file" ? isSelected : undefined}
                    aria-label={row.kind === "group" ? row.name : row.path}
                    data-index={index}
                    data-changed={row.changed > 0 ? "" : undefined}
                    title={row.kind === "group" ? row.name : row.path}
                    style:top={`${index * rowHeight}px`}
                    style:height={`${rowHeight}px`}
                    onclick={() => activate(row, index)}
                    onfocusin={() => active = index}
                    oncontextmenu={event => rowMenu(event, row, index)}
                >
                    <FileRow {row} dirty={dirty?.has(row.path) ?? false} />
                </div>
            {/if}
        {/each}
    </div>
    {#if !rows.length}<p class="tree-note">{narrowed || changedOnly ? "No matching files" : empty}</p>{/if}
</div>

<style>
    .tree-scroll { position: relative; flex: 1; min-height: 0; margin-inline: var(--panel-inset); overflow: auto; overscroll-behavior: contain; pointer-events: auto; }
    .tree-note { margin: var(--space-2) 0; color: var(--muted); font: var(--font-body); }
    .tree-space { position: relative; }
    .row-measure { position: absolute; width: 1px; height: var(--file-row-height); visibility: hidden; pointer-events: none; }
    .tree-slot { position: absolute; inset-inline: 0; box-sizing: border-box; pointer-events: auto; }
    .tree-slot > :global(.selection-item) { block-size: 100%; }
    .tree-row { display: flex; align-items: center; cursor: pointer; }
    .tree-row > :global(*) { pointer-events: none; }
</style>
