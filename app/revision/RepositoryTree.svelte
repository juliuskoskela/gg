<script module lang="ts">
    import type { RevisionTree } from "../messages/RevisionTree";

    let cache = new Map<string, RevisionTree>();
    let cacheLimit = 6;

    function remember(key: string, tree: RevisionTree) {
        cache.delete(key);
        cache.set(key, tree);
        while (cache.size > cacheLimit) cache.delete(cache.keys().next().value!);
    }
</script>

<script lang="ts">
    import { onDestroy, untrack } from "svelte";
    import ViewToolbar from "../controls/ViewToolbar.svelte";
    import TreeTools from "./TreeTools.svelte";
    import { query } from "../ipc";
    import type { Command } from "../commands/registry";
    import type { RevChange } from "../messages/RevChange";
    import type { RevHeader } from "../messages/RevHeader";
    import { repoConfigEvent } from "../stores";
    import FileTreeView from "../tree/FileTreeView.svelte";
    import { treeSummary, type TreeRow } from "../tree/fileTree";

    // loads a revision's whole listing for the shared tree view; the Editor browses the working copy through it
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
    let request = 0;
    onDestroy(() => request++);

    let source = $derived(headers[0]?.id ?? null);
    let repo = $derived($repoConfigEvent.type === "Workspace" ? $repoConfigEvent.absolute_path : "");
    let treeKey = $derived(source ? `${repo}\0${source.commit.hex}` : "");

    async function load(key: string) {
        let generation = ++request;
        let id = source;
        error = "";
        if (!id) { tree = null; loading = false; return; }
        let hit = cache.get(key);
        if (hit) { remember(key, hit); tree = hit; loading = false; shownRepo = repo; return; }
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
    }

    $effect.pre(() => {
        let key = treeKey;
        untrack(() => { void load(key); });
    });
    $effect.pre(() => { let next = tree ? treeSummary(tree.files, changes) : null; untrack(() => { if (next?.files !== summary?.files || next?.changed !== summary?.changed) summary = next; }); });
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
        <FileTreeView {changes} paths={tree.files} selectedPath={openPath ?? selectedPath} bind:filter bind:changedOnly label="Repository files" memoryKey={repo} seedKey={treeKey} empty="This revision has no files." {onOpen} {onSelect} {dirty} {onMenu} />
        {#if tree.truncated}<p class="tree-note">Showing the first 50,000 files.</p>{/if}
    {/if}
</div>

<style>
    .repository-tree { display: flex; flex-direction: column; flex: 1; min-height: 0; min-width: 0; background: var(--surface); }
    .tree-status, .tree-note { margin: var(--space-2) var(--panel-inset); color: var(--muted); font: var(--font-body); }
</style>
