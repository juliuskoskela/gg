<script module lang="ts">
    import type { RevisionTree } from "../messages/RevisionTree";

    // expanded folders are remembered per repository, and a revision's changed folders open only once
    let expandedByRepo = new Map<string, Set<string>>();
    let seeded = new Set<string>();
    let cache = new Map<string, RevisionTree>();
    let cacheLimit = 6;

    function remember(key: string, tree: RevisionTree) {
        cache.delete(key);
        cache.set(key, tree);
        while (cache.size > cacheLimit) cache.delete(cache.keys().next().value!);
    }
</script>

<script lang="ts">
    import { onDestroy, tick, untrack } from "svelte";
    import FileIcon from "../controls/FileIcon.svelte";
    import Icon from "../controls/Icon.svelte";
    import ViewToolbar from "../controls/ViewToolbar.svelte";
    import TreeTools from "./TreeTools.svelte";
    import { navigationIndex, revealRow, virtualRange } from "../controls/listNavigation";
    import { query } from "../ipc";
    import type { Command } from "../commands/registry";
    import type { RevChange } from "../messages/RevChange";
    import type { RevHeader } from "../messages/RevHeader";
    import { repoConfigEvent } from "../stores";
    import { ancestors, defaultExpanded, treeSummary, visibleRows, type TreeRow } from "./repositoryTree";

    interface Props {
        headers: RevHeader[];
        changes: RevChange[];
        selectedPath: string;
        onSelect: (change: RevChange) => void;
        // a host that shows the files next to something else can take over the toolbar and the filter state
        toolbar?: boolean;
        filter?: string;
        changedOnly?: boolean;
        summary?: ReturnType<typeof treeSummary> | null;
        // every file click, including unchanged files
        onOpen?: (path: string, change?: RevChange) => void;
        openPath?: string;
        dirty?: ReadonlySet<string>;
        // a right-click or the menu key on a row; folder commands are the ones only the tree can run
        onMenu?: (row: TreeRow, at: { x: number; y: number }, folder: Command[]) => void;
    }

    let { headers, changes, selectedPath, onSelect, toolbar = true, filter = $bindable(""), changedOnly = $bindable(false), summary = $bindable(null), onOpen, openPath, dirty, onMenu }: Props = $props();

    let tree = $state.raw<RevisionTree | null>(null);
    let loading = $state(false);
    let shownRepo = "";
    let error = $state("");
    let expanded = $state.raw<Set<string>>(new Set());
    let picked = $state("");
    let active = $state(0);
    let viewport = $state<HTMLElement>();
    let height = $state(440);
    let top = $state(0);
    let rowHeight = $state(24);
    let request = 0;
    onDestroy(() => request++);

    let source = $derived(headers[0]?.id ?? null);
    let repo = $derived($repoConfigEvent.type === "Workspace" ? $repoConfigEvent.absolute_path : "");
    let treeKey = $derived(source ? `${repo}\0${source.commit.hex}` : "");
    let formatter = new Intl.NumberFormat();

    function persist(next: Set<string>) {
        expanded = next;
        expandedByRepo.set(repo, next);
    }

    function seed(key: string) {
        if (seeded.has(key)) return;
        seeded.add(key);
        persist(new Set([...expanded, ...defaultExpanded(changes)]));
    }

    async function load(key: string) {
        let generation = ++request;
        let id = source;
        expanded = expandedByRepo.get(repo) ?? new Set();
        error = "";
        if (!id) { tree = null; loading = false; return; }
        let hit = cache.get(key);
        if (hit) { remember(key, hit); tree = hit; loading = false; seed(key); shownRepo = repo; return; }
        // a new commit of the same repository (a snapshot, a save) keeps the old listing up until the new one arrives
        if (shownRepo !== repo) tree = null;
        loading = !tree;
        let result = await query<RevisionTree>("query_revision_tree", { id });
        if (generation !== request) return;
        loading = false;
        if (result.type === "error") { error = `Couldn’t load files: ${result.message}`; return; }
        remember(key, result.value);
        tree = result.value;
        shownRepo = repo;
        seed(key);
    }

    $effect.pre(() => {
        let key = treeKey;
        untrack(() => { void load(key); });
    });
    $effect.pre(() => { picked = openPath ?? selectedPath; });
    // a new revision starts at the top
    $effect.pre(() => {
        void treeKey;
        untrack(() => { top = 0; active = 0; if (viewport) viewport.scrollTop = 0; });
    });

    let rows = $derived(tree ? visibleRows({ files: tree.files, changes, expanded, filter, changedOnly }) : []);
    $effect.pre(() => { let next = tree ? treeSummary(tree.files, changes) : null; untrack(() => { if (next?.files !== summary?.files || next?.changed !== summary?.changed) summary = next; }); });
    let range = $derived(virtualRange(top, height, rowHeight, 4, 4));
    let start = $derived(range.start);
    let end = $derived(Math.min(rows.length, range.end));
    let stop = $derived(Math.max(start, Math.min(active, end - 1)));
    let narrowed = $derived(filter.trim() !== "");

    function toggle(row: TreeRow) {
        let next = new Set(expanded);
        if (!next.delete(row.path)) next.add(row.path);
        persist(next);
    }

    function activate(row: TreeRow, index: number) {
        active = index;
        if (row.kind === "folder") { toggle(row); return; }
        picked = row.path;
        if (row.change) onSelect(row.change);
        onOpen?.(row.path, row.change);
    }

    async function focusRow(index: number) {
        active = index;
        top = revealRow(top, height, rowHeight, index);
        if (viewport) viewport.scrollTop = top;
        await tick();
        viewport?.querySelector<HTMLElement>(`[data-index="${index}"]`)?.focus({ preventScroll: true });
    }

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
            for (let file of tree?.files ?? []) if (file.startsWith(prefix)) for (let folder of ancestors(file)) if (folder.startsWith(prefix) || folder === row.path) next.add(folder);
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
        if (onMenu && (event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey))) {
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
            if (row.kind !== "folder") return;
            event.preventDefault();
            if (!row.expanded) toggle(row);
            else if (rows[index + 1]?.depth > row.depth) void focusRow(index + 1);
        } else if (event.key === "ArrowLeft") {
            event.preventDefault();
            if (row.kind === "folder" && row.expanded && !narrowed) { toggle(row); return; }
            let parent = parentIndex(index);
            if (parent >= 0) void focusRow(parent);
        } else if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            activate(row, index);
        }
    }

    function counts(change: RevChange, sign: string) {
        return change.hunks.reduce((total, hunk) => total + hunk.lines.lines.filter(line => line.startsWith(sign)).length, 0);
    }
    let added = (change: RevChange) => change.stat?.added ?? counts(change, "+");
    let removed = (change: RevChange) => change.stat?.removed ?? counts(change, "-");
</script>

<div class="repository-tree">
    {#if toolbar}
        <ViewToolbar label="Files tools"><TreeTools bind:filter bind:changedOnly {summary} /></ViewToolbar>
    {/if}
    {#if !source}
        <p class="tree-status" role="status">Select a revision to browse its files.</p>
    {:else if error}
        <p class="tree-status" role="alert">{error}</p>
    {:else if loading || !tree}
        <p class="tree-status" role="status">Loading files…</p>
    {:else}
        {#if headers.length > 1}<p class="tree-note">Showing the newest of {headers.length} selected revisions.</p>{/if}
        <!-- svelte-ignore a11y_no_noninteractive_element_interactions (arrow keys move between tree items) -->
        <div class="tree-scroll" role="tree" tabindex="-1" aria-label="Repository files" bind:this={viewport} bind:clientHeight={height} onscroll={event => top = event.currentTarget.scrollTop} onkeydown={keydown}>
            <div class="row-measure" aria-hidden="true" bind:clientHeight={rowHeight}></div>
            <div class="tree-space" style:height={`${rows.length * rowHeight}px`}>
                {#each rows.slice(start, end) as row, i (i)}
                    {@const index = start + i}
                    {@const change = row.change}
                    <!-- svelte-ignore a11y_click_events_have_key_events (the tree handles keys) -->
                    <div
                        class="tree-row"
                        class:folder={row.kind === "folder"}
                        class:selected={row.kind === "file" && row.path === picked}
                        class:deleted={change?.kind === "Deleted"}
                        role="treeitem"
                        tabindex={index === stop ? 0 : -1}
                        aria-level={row.depth + 1}
                        aria-expanded={row.kind === "folder" ? !!row.expanded : undefined}
                        aria-selected={row.kind === "file" && row.path === picked}
                        aria-label={row.path}
                        data-index={index}
                        data-changed={row.changed > 0 ? "" : undefined}
                        title={row.path}
                        style:--depth={row.depth}
                        style:top={`${index * rowHeight}px`}
                        style:height={`${rowHeight}px`}
                        onclick={() => activate(row, index)}
                        onfocus={() => active = index}
                        oncontextmenu={event => rowMenu(event, row, index)}
                    >
                        {#if row.kind === "folder"}
                            <span class="chevron" class:open={row.expanded}><Icon name="chevron-right" /></span>
                            <span class="name" dir="auto">{row.name}</span>
                            {#if row.changed}<span class="count" aria-label="{row.changed} changed">{formatter.format(row.changed)}</span>{/if}
                        {:else}
                            <FileIcon path={row.path} />
                            <span class="name" dir="auto">{row.name}</span>
                            {#if dirty?.has(row.path)}<span class="unsaved" role="img" aria-label="Unsaved changes" title="Unsaved changes"></span>{/if}
                            {#if change}
                                {#if change.has_conflict}
                                    <span class="kind" role="img" aria-label="Unresolved conflict" title="Unresolved conflict"><Icon name="alert-triangle" state="remove" /></span>
                                {:else if change.kind === "Added" || change.kind === "Deleted"}
                                    <span class="kind" role="img" aria-label={change.kind} title={change.kind}><Icon name={change.kind === "Added" ? "file-plus" : "file-minus"} state={change.kind === "Added" ? "add" : "remove"} /></span>
                                {/if}
                                {#if added(change) || removed(change)}
                                    <span class="stat" aria-label="{added(change)} added, {removed(change)} removed lines">{#if added(change)}<span class="ins">+{added(change)}</span>{/if}{#if removed(change)}<span class="del">−{removed(change)}</span>{/if}</span>
                                {:else if change.kind === "Modified" && !change.has_conflict}
                                    <span class="kind modified" role="img" aria-label="Modified" title="Modified"></span>
                                {/if}
                            {/if}
                        {/if}
                    </div>
                {/each}
            </div>
            {#if !rows.length}<p class="tree-note">{narrowed || changedOnly ? "No matching files" : "This revision has no files."}</p>{/if}
            {#if tree.truncated}<p class="tree-note">Showing the first 50,000 files.</p>{/if}
        </div>
    {/if}
</div>

<style>
    .repository-tree { display: flex; flex-direction: column; flex: 1; min-height: 0; min-width: 0; background: var(--surface); }
    .tree-status, .tree-note { margin: var(--space-2) var(--panel-inset); color: var(--muted); font: var(--font-body); }
    .tree-scroll { position: relative; flex: 1; min-height: 0; margin-inline: var(--panel-inset); overflow: auto; overscroll-behavior: contain; pointer-events: auto; }
    .tree-scroll .tree-note { margin-inline: 0; }
    .tree-space { position: relative; }
    .row-measure { position: absolute; width: 1px; height: var(--file-row-height); visibility: hidden; pointer-events: none; }
    .tree-row { position: absolute; inset-inline: 0; box-sizing: border-box; display: flex; align-items: center; gap: var(--space-2); padding-inline-end: var(--space-1); padding-inline-start: calc(var(--space-3) * var(--depth)); border-radius: var(--radius-control); color: var(--text); font: var(--font-body); cursor: pointer; pointer-events: auto; }
    .tree-row > :global(*) { pointer-events: none; }
    .tree-row:hover { background: var(--interaction-hover); }
    .tree-row.selected { background: var(--selection-bg); }
    .tree-row:focus-visible { outline: var(--focus-width) solid var(--focus-ring); outline-offset: calc(-1 * var(--focus-width)); }
    .name { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .deleted .name { color: var(--muted); text-decoration: line-through; }
    .chevron { display: flex; flex: 0 0 auto; }
    .chevron.open :global(svg) { transform: rotate(90deg); }
    :global([dir="rtl"]) .chevron :global(svg) { transform: rotate(180deg); }
    :global([dir="rtl"]) .chevron.open :global(svg) { transform: rotate(90deg); }
    .count { flex: 0 0 auto; color: var(--muted); font: var(--font-label); font-variant-numeric: tabular-nums; }
    .kind { display: flex; flex: 0 0 auto; --icon-size: var(--space-3); }
    .unsaved { flex: 0 0 auto; inline-size: var(--space-2); block-size: var(--space-2); border-radius: 50%; background: var(--warning); }
    .kind.modified { inline-size: var(--space-1); block-size: var(--space-1); border-radius: 50%; background: var(--faint); }
    .stat { display: flex; flex: 0 0 auto; gap: var(--space-1); font: var(--font-label); font-variant-numeric: tabular-nums; }
    .ins { color: var(--positive); }
    .del { color: var(--negative); }
</style>
