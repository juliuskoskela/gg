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
    import TextField from "../controls/TextField.svelte";
    import ToggleItem from "../controls/ToggleItem.svelte";
    import ToggleTray from "../controls/ToggleTray.svelte";
    import ViewToolbar from "../controls/ViewToolbar.svelte";
    import { navigationIndex, revealRow, virtualRange } from "../controls/listNavigation";
    import { query } from "../ipc";
    import type { RevChange } from "../messages/RevChange";
    import type { RevHeader } from "../messages/RevHeader";
    import { repoConfigEvent } from "../stores";
    import { defaultExpanded, treeSummary, visibleRows, type TreeRow } from "./repositoryTree";

    interface Props {
        headers: RevHeader[];
        changes: RevChange[];
        selectedPath: string;
        onSelect: (change: RevChange) => void;
    }

    let { headers, changes, selectedPath, onSelect }: Props = $props();

    let tree = $state.raw<RevisionTree | null>(null);
    let loading = $state(false);
    let error = $state("");
    let expanded = $state.raw<Set<string>>(new Set());
    let filter = $state("");
    let changedOnly = $state(false);
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
        if (hit) { remember(key, hit); tree = hit; loading = false; seed(key); return; }
        tree = null;
        loading = true;
        let result = await query<RevisionTree>("query_revision_tree", { id });
        if (generation !== request) return;
        loading = false;
        if (result.type === "error") { error = `Couldn’t load files: ${result.message}`; return; }
        remember(key, result.value);
        tree = result.value;
        seed(key);
    }

    $effect.pre(() => {
        let key = treeKey;
        untrack(() => { void load(key); });
    });
    $effect.pre(() => { picked = selectedPath; });
    // a new revision starts at the top
    $effect.pre(() => {
        void treeKey;
        untrack(() => { top = 0; active = 0; if (viewport) viewport.scrollTop = 0; });
    });

    let rows = $derived(tree ? visibleRows({ files: tree.files, changes, expanded, filter, changedOnly }) : []);
    let summary = $derived(tree ? treeSummary(tree.files, changes) : null);
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

    function keydown(event: KeyboardEvent) {
        let item = (event.target as HTMLElement).closest<HTMLElement>("[data-index]");
        if (!item || event.altKey || event.ctrlKey || event.metaKey) return;
        let index = Number(item.dataset.index);
        let row = rows[index];
        if (!row) return;
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
    <ViewToolbar label="Files tools">
        <div class="tree-filter toolbar-lead"><TextField className="tree-search" type="search" label="Filter files" placeholder="Find a file…" bind:value={filter} /></div>
        {#if summary}
            <div class="tree-summary toolbar-lead"><span>{formatter.format(summary.files)} {summary.files === 1 ? "file" : "files"}</span><span>{formatter.format(summary.changed)} changed</span></div>
        {/if}
        <ToggleTray label="File filter"><ToggleItem on={changedOnly} label="Changed only" text="Changed only" onClick={() => changedOnly = !changedOnly} /></ToggleTray>
    </ViewToolbar>
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
                    >
                        {#if row.kind === "folder"}
                            <span class="chevron" class:open={row.expanded}><Icon name="chevron-right" /></span>
                            <span class="name" dir="auto">{row.name}</span>
                            {#if row.changed}<span class="count" aria-label="{row.changed} changed">{formatter.format(row.changed)}</span>{/if}
                        {:else}
                            <FileIcon path={row.path} />
                            <span class="name" dir="auto">{row.name}</span>
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
    .tree-filter { flex: 1; min-width: 120px; max-width: 360px; }
    .tree-filter :global(.tree-search) { width: 100%; }
    .tree-summary { display: flex; gap: var(--space-2); white-space: nowrap; }
    .tree-summary span { color: var(--muted); font: var(--font-label); }
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
    .kind.modified { inline-size: var(--space-1); block-size: var(--space-1); border-radius: 50%; background: var(--faint); }
    .stat { display: flex; flex: 0 0 auto; gap: var(--space-1); font: var(--font-label); font-variant-numeric: tabular-nums; }
    .ins { color: var(--positive); }
    .del { color: var(--negative); }
    @media (pointer: coarse), (max-width: 600px) { .repository-tree :global(.tree-search) { min-height: 44px; } }
</style>
