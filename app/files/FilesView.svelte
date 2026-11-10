<script module lang="ts">
    // a mutation reloads the selection and remounts the view; the open file must survive that
    let openFiles = new Map<string, string>();
</script>

<script lang="ts">
    import { onDestroy, untrack } from "svelte";
    import { get } from "svelte/store";
    import ActionWidget from "../controls/ActionWidget.svelte";
    import Badge from "../controls/Badge.svelte";
    import TextField from "../controls/TextField.svelte";
    import Icon from "../controls/Icon.svelte";
    import ToggleItem from "../controls/ToggleItem.svelte";
    import ViewToolbar from "../controls/ViewToolbar.svelte";
    import { mutate, query } from "../ipc";
    import type { FileContent } from "../messages/FileContent";
    import type { RevChange } from "../messages/RevChange";
    import type { WriteFile } from "../messages/WriteFile";
    import BrowserPane from "../tree/BrowserPane.svelte";
    import PaneBar from "../tree/PaneBar.svelte";
    import PlacementMenu from "../tree/PlacementMenu.svelte";
    import { isHorizontal } from "../tree/placement";
    import RepositoryTree from "../revision/RepositoryTree.svelte";
    import TreeTools from "../revision/TreeTools.svelte";
    import type { treeSummary } from "../tree/fileTree";
    import { currentMutation, repoConfigEvent, repoStatusEvent, workingCopySelection } from "../stores";
    import { fileBuffers, dirtyPaths } from "./buffers";
    import { gutterMarks } from "./gutterMarks";
    import { annotations, lineMenu } from "../annotations/store";
    import { pasteReason } from "../commands/textCommands";
    import { editorCommands, type EditorMenu } from "./editorMenu";
    import { treeCommands } from "./treeMenu";
    import { lineNotes } from "./noteGutter";
    import type { TreeRow } from "../tree/fileTree";
    import type { Command } from "../commands/registry";
    import { loadRevisionDiff, loadRevisionSummary, type RevisionDetail } from "../revision/data";
    import { repositoryScope } from "../workspace/repository";
    import { NARROW_WIDTH, filesLayout } from "./layout";
    import { formatSize } from "./size";

    interface Props {
        /** shows the working-copy diff of the open file; the host decides where that lives */
        onOpenDiff: (change: RevChange) => void;
    }

    let { onOpenDiff }: Props = $props();

    // the backend's precondition message for a write against a file that moved on
    let CHANGED = "This file changed since it was opened.";
    let LOADING_DELAY = 150;

    let width = $state(0);
    let openPath = $state(untrack(() => openFiles.get(repositoryKey()) ?? ""));
    let page = $state<"tree" | "editor">(untrack(() => openPath ? "editor" : "tree"));
    let loaded = $state.raw<FileContent | null>(null);
    let loadingVisible = $state(false);
    let error = $state("");
    let saveError = $state("");
    let conflict = $state(false);
    let saving = $state(false);
    let text = $state("");
    // the version the current edit started from; it outlives refreshes so a moved file is still noticed
    let baseVersion = $state("");
    let restoredDirty = $state(false);
    let filter = $state("");
    let changedOnly = $state(false);
    let summary = $state.raw<ReturnType<typeof treeSummary> | null>(null);
    let generation = 0;
    let loadingTimer: ReturnType<typeof setTimeout> | undefined;
    // after a save the next answers for the old version are stale and must not undo it
    let awaiting: { path: string; version: string } | null = null;
    let loadedPath = "";
    let loadedScope = "";

    // the editor always follows the working copy; the timeline selection belongs to the diff view
    let detail = $state.raw<RevisionDetail | null>(null);
    let revisionError = $state("");
    let revisionRun = 0;
    let workingCopy = $derived($repoStatusEvent?.working_copy.hex ?? "");
    let headers = $derived(detail?.headers.slice(0, 1) ?? []);
    let changes = $derived(detail?.changes ?? []);
    let header = $derived(headers[0]);
    let source = $derived(header?.id ?? null);

    // the previous detail stays on screen while a refresh is in flight
    async function loadRevision() {
        let status = get(repoStatusEvent);
        if (!status) return;
        let run = ++revisionRun;
        revisionError = "";
        let result = await loadRevisionSummary(workingCopySelection(status));
        if (run !== revisionRun) return;
        if (result.type === "error") { revisionError = `Couldn’t load the working copy: ${result.message}`; return; }
        if (result.value.type !== "Detail") { revisionError = "Couldn’t find the working copy."; return; }
        detail = result.value;
    }
    $effect(() => {
        let commit = workingCopy;
        if (commit) untrack(() => { void loadRevision(); });
    });
    function repositoryKey() { let config = get(repoConfigEvent); return config.type === "Workspace" ? config.absolute_path : ""; }
    let scope = $derived($repoConfigEvent.type === "Workspace" ? $repoConfigEvent.absolute_path : "");
    let narrow = $derived(width > 0 && width < NARROW_WIDTH);
    let treeShown = $derived(narrow ? page === "tree" : $filesLayout.treeOpen);
    let editorShown = $derived(!narrow || page === "editor");
    let openChange = $derived(openPath ? changes.find(change => change.path.repo_path === openPath) : undefined);
    let dirtySet = $derived(dirtyPaths($fileBuffers, scope));
    let file = $derived(loaded?.type === "Text" ? loaded : null);
    let editable = $derived(!!file?.editable);
    let dirty = $derived(!!file && text !== file.text);
    // the diff of the open file, through the diff view's cache, for the change gutter
    let openDiff = $state.raw<RevChange | null>(null);
    $effect(() => {
        let revision = detail, file = openChange, repository = repositoryScope($repoConfigEvent);
        openDiff = null;
        if (!revision || !file || !repository) return;
        let current = true;
        void loadRevisionDiff(revision, file, repository).then(result => { if (current && result.type === "data") openDiff = result.value; });
        return () => { current = false; };
    });
    let marks = $derived(restoredDirty ? [] : gutterMarks(openDiff ?? undefined));
    let segments = $derived(openPath.split("/"));
    let notes = $derived(lineNotes(openPath, header, $annotations));

    // the menus are the app's own, so nothing native appears over the editor or the tree
    async function editorMenu(menu: EditorMenu) {
        let paste = await pasteReason();
        let change = openChange;
        lineMenu.set({ x: menu.x, y: menu.y, heading: null, commands: editorCommands({ ...menu, path: openPath, header, dirty, paste, onOpenDiff: change ? () => onOpenDiff(change) : undefined }) });
    }
    function treeMenu(row: TreeRow, at: { x: number; y: number }, folder: Command[]) {
        lineMenu.set({ x: at.x, y: at.y, heading: null, commands: treeCommands({ row, header, onOpen: open, onOpenDiff, folder }) });
    }

    function stopLoadingTimer() {
        clearTimeout(loadingTimer);
        loadingVisible = false;
    }
    onDestroy(() => { generation++; revisionRun++; clearTimeout(loadingTimer); });

    function apply(value: FileContent, path: string, opening: boolean) {
        if (value.type !== "Text") { loaded = value; return; }
        if (awaiting && awaiting.path === path) {
            if (value.version === awaiting.version) return;
            awaiting = null;
        }
        let buffer = value.editable ? fileBuffers.get(scope, path) : undefined;
        if (buffer && buffer.text !== value.text) {
            loaded = value;
            text = buffer.text;
            baseVersion = buffer.version;
            conflict = buffer.version !== value.version;
            if (opening) restoredDirty = true;
            return;
        }
        if (buffer) fileBuffers.discard(scope, path);
        loaded = value;
        text = value.text;
        baseVersion = value.version;
        conflict = false;
        restoredDirty = false;
    }

    // a stale answer is dropped by the generation; the backend finishes the work either way
    async function load(path: string, opening: boolean) {
        let run = ++generation;
        let id = source;
        error = "";
        if (opening) {
            loaded = null;
            text = "";
            conflict = false;
            saveError = "";
            restoredDirty = false;
            awaiting = null;
            clearTimeout(loadingTimer);
            loadingVisible = false;
            if (path && id) loadingTimer = setTimeout(() => { if (run === generation) loadingVisible = true; }, LOADING_DELAY);
        }
        if (!path || !id) { stopLoadingTimer(); loaded = null; return; }
        loadedPath = path;
        loadedScope = scope;
        let result = await query<FileContent>("query_file", { id, path });
        if (run !== generation) return;
        stopLoadingTimer();
        if (result.type === "error") { error = `Couldn’t open the file: ${result.message}`; return; }
        apply(result.value, path, opening);
    }

    $effect.pre(() => {
        let path = openPath, commit = source?.commit.hex ?? "", place = scope;
        void commit;
        untrack(() => { void load(path, path !== loadedPath || place !== loadedScope); });
    });

    function open(path: string) {
        openPath = path;
        openFiles.set(scope, path);
        page = "editor";
    }

    function edit(next: string) {
        text = next;
        if (file && file.editable) fileBuffers.edit(scope, openPath, next, { text: file.text, version: baseVersion });
    }

    function revert() {
        if (!file) return;
        fileBuffers.discard(scope, openPath);
        text = file.text;
        baseVersion = file.version;
        restoredDirty = false;
        conflict = false;
    }

    function reload() {
        fileBuffers.discard(scope, openPath);
        conflict = false;
        saveError = "";
        void load(openPath, false);
    }

    // mutate reports failure as false and leaves the reason in the shared mutation state, which would open a dialog
    function failure(): string {
        let state = get(currentMutation);
        let message = "";
        if (state?.type === "data") {
            let result = state.value;
            if (result.type === "PreconditionError") message = result.message;
            else if (result.type === "InternalError") message = result.message.lines.join("\n");
        } else if (state?.type === "error") message = state.message;
        if (message) currentMutation.set(null);
        return message;
    }

    async function save() {
        let current = file;
        let id = source;
        if (!current || !current.editable || !id || !dirty || saving) return;
        let path = openPath, body = text, version = baseVersion;
        saving = true;
        saveError = "";
        currentMutation.set(null);
        let ok = await mutate<WriteFile>("write_file", { id, path, text: body, base_version: version }, { operation: "Saving file…" });
        saving = false;
        if (ok) {
            fileBuffers.discard(scope, path);
            if (path !== openPath) return;
            awaiting = { path, version: current.version };
            loaded = { ...current, text: body };
            conflict = false;
            restoredDirty = false;
            void load(path, false);
            return;
        }
        let message = failure();
        if (path !== openPath) return;
        if (message === CHANGED) conflict = true;
        else saveError = message ? `Couldn’t save: ${message}` : "Couldn’t save the file.";
    }

    async function overwrite() {
        let id = source;
        if (!id || !file) return;
        let path = openPath;
        let run = ++generation;
        let result = await query<FileContent>("query_file", { id, path });
        if (run !== generation || path !== openPath) return;
        if (result.type === "error") { saveError = `Couldn’t overwrite: ${result.message}`; return; }
        let value = result.value;
        if (value.type !== "Text" || !value.editable) { saveError = "This file can’t be overwritten."; return; }
        loaded = value;
        baseVersion = value.version;
        conflict = false;
        await save();
    }

    function retry() {
        void load(openPath, true);
    }
</script>

<div class="files-view" class:narrow bind:clientWidth={width}>
    <ViewToolbar label="Editor tools">
        <TreeTools bind:filter bind:changedOnly {summary} filterField={false} filters={!(narrow && page === "editor")} trayLabel="Editor options">
            <ToggleItem icon="corner-down-left" label="Wrap lines" on={$filesLayout.wrap} onClick={() => filesLayout.toggleWrap()} />
        </TreeTools>
        {#if !narrow}
            <PlacementMenu label="Editor layout" paneLabel="File tree" open={$filesLayout.treeOpen} side={$filesLayout.treeSide} onOpen={open => filesLayout.setTreeOpen(open)} onSide={side => filesLayout.setTreeSide(side)} />
        {/if}
    </ViewToolbar>
    {#if revisionError}
        <div class="notice" role="alert"><span>{revisionError}</span><ActionWidget onClick={() => void loadRevision()}>Retry</ActionWidget></div>
    {/if}
    {#if !detail}
        {#if !revisionError}<p class="message" role="status">Loading…</p>{/if}
    {:else}
    {#snippet treePane()}
        <div class="tree-pane">
            <!-- the tree's bar continues the editor's file bar, so the two read as one band split by the divider -->
            <PaneBar><div class="bar-field"><TextField className="tree-search" type="search" label="Filter files" placeholder="Find a file…" bind:value={filter} /></div></PaneBar>
            <RepositoryTree {headers} {changes} selectedPath="" onSelect={() => {}} toolbar={false} bind:filter bind:changedOnly bind:summary onOpen={path => open(path)} {openPath} dirty={dirtySet} onMenu={treeMenu} />
        </div>
    {/snippet}
    {#snippet editorPane()}
            <section class="editor-pane" aria-label="File editor">
                <!-- the bar stays without a file, so the band across both panes never breaks -->
                {#if !openPath}<div class="pane-bar editor-bar"></div>{/if}
                {#if openPath}
                    <div class="pane-bar editor-bar">
                        {#if narrow}<button type="button" class="text-link back" onclick={() => page = "tree"} aria-label="Back to file tree"><Icon name="chevron-left" />Files</button>{/if}
                        <span class="crumbs" aria-label={openPath}>{#each segments as segment, i (i)}{#if i > 0}<span class="sep">/</span>{/if}<span class={i === segments.length - 1 ? "leaf" : "folder"}>{segment}</span>{/each}</span>
                        {#if file}
                            {#if editable}<Badge>Working copy</Badge>
                            {:else}<Badge tone="muted">Read only</Badge>{/if}
                            {#if file.has_conflict}<Badge tone="warning">Conflicted</Badge>{/if}
                            {#if dirty}<Badge tone="warning">Unsaved</Badge>{/if}
                        {/if}
                        <span class="bar-actions">
                            {#if openChange}<button type="button" class="text-link" onclick={() => onOpenDiff(openChange)}>Open diff</button>{/if}
                            {#if file && editable && dirty}
                                <ActionWidget secondary onClick={revert} disabled={saving}>Revert</ActionWidget>
                                <ActionWidget primary onClick={() => void save()} disabled={saving}>Save</ActionWidget>
                            {/if}
                        </span>
                    </div>
                    {#if conflict}
                        <div class="notice warn" role="alert">
                            <span>This file changed on disk since you opened it.</span>
                            <ActionWidget onClick={reload}>Reload</ActionWidget>
                            <ActionWidget onClick={() => void overwrite()}>Overwrite</ActionWidget>
                        </div>
                    {/if}
                    {#if saveError}<div class="notice warn" role="alert"><span>{saveError}</span></div>{/if}
                    {#if error}
                        <div class="notice" role="alert"><span>{error}</span><ActionWidget onClick={retry}>Retry</ActionWidget></div>
                    {:else if file}
                        <!-- the editor engine loads when the first file opens, so it stays out of the main bundle -->
                        {#await import("./CodeEditor.svelte") then { default: CodeEditor }}
                            <CodeEditor {text} path={openPath} readOnly={!editable || saving} wrap={$filesLayout.wrap} changes={marks} {notes} onMenu={editorMenu} onChange={edit} onSave={() => void save()} label="Contents of {openPath}" />
                        {/await}
                    {:else if loaded?.type === "Binary"}
                        <p class="message">This is a binary file ({formatSize(loaded.size)}).</p>
                    {:else if loaded?.type === "TooLarge"}
                        <p class="message">This file is too large to open here ({formatSize(loaded.size)}; the limit is {formatSize(loaded.limit)}).</p>
                    {:else if loaded?.type === "Missing"}
                        <p class="message">This file isn’t in this revision.</p>
                    {:else if loadingVisible}
                        <p class="message" role="status">Loading…</p>
                    {/if}
                {:else}
                    <p class="message">Select a file to open it.</p>
                {/if}
            </section>
    {/snippet}
    {#if narrow}
        <!-- two pages: the tree stays mounted while hidden so its scroll position, folders and filter survive -->
        <div class="body">
            <div class="page" hidden={!treeShown}>{@render treePane()}</div>
            {#if editorShown}{@render editorPane()}{/if}
        </div>
    {:else}
        <div class="body">
            <BrowserPane side={$filesLayout.treeSide} open={$filesLayout.treeOpen} size={isHorizontal($filesLayout.treeSide) ? $filesLayout.treeWidth : $filesLayout.treeHeight} onResize={size => isHorizontal($filesLayout.treeSide) ? filesLayout.setTreeWidth(size) : filesLayout.setTreeHeight(size)} label="Resize file tree" keepMounted content={editorPane} pane={treePane} />
        </div>
    {/if}
    {/if}
</div>

<style>
    .files-view { position: relative; display: flex; flex-direction: column; flex: 1; min-width: 0; min-height: 0; background: var(--surface); }
    .body { position: relative; display: flex; flex: 1; min-height: 0; min-width: 0; }
    .tree-pane { display: flex; flex-direction: column; flex: 1; min-width: 0; min-height: 0; pointer-events: auto; }
    .tree-pane > :global(:last-child) { flex: 1; min-height: 0; }
    .page { display: flex; flex-direction: column; flex: 1; min-width: 0; min-height: 0; }
    .page[hidden] { display: none; }
    /* both panes open on a bar of the same height and shade, closed by the inner rule */
    .pane-bar { display: flex; flex: none; align-items: center; gap: var(--panel-gap); min-width: 0; min-height: var(--panel-toolbar-height); box-sizing: border-box; background: var(--panel-header-bg); border-block-end: 1px solid var(--view-inner-rule); --control-height: var(--panel-control-size); --control-padding-block: var(--control-padding-compact); --input-surface: var(--panel-header-bg); }
    .editor-pane { display: flex; flex-direction: column; flex: 1; min-width: 0; min-height: 0; background: var(--surface); pointer-events: auto; }
    .editor-bar { padding-inline: var(--panel-inset); --hover: color-mix(in srgb, var(--text) 6%, var(--panel-header-bg)); }
    .crumbs { display: flex; flex: 0 1 auto; align-items: baseline; gap: var(--space-1); min-width: 0; overflow: hidden; white-space: nowrap; }
    .crumbs .folder { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; color: var(--muted); font: var(--font-label); }
    .crumbs .leaf { flex: 0 0 auto; color: var(--text); font: var(--font-body); }
    .crumbs .sep { flex: none; color: var(--faint); font: var(--font-label); }
    .bar-actions { display: flex; align-items: center; gap: var(--panel-gap); margin-inline-start: auto; flex: none; pointer-events: auto; }
    .bar-actions > :global(*) { pointer-events: auto; }
    .back { flex: none; pointer-events: auto; }
    .editor-bar .text-link { pointer-events: auto; }
    .notice { display: flex; flex: none; flex-wrap: wrap; align-items: center; gap: var(--panel-gap); padding: var(--space-2) var(--panel-inset); background: var(--panel-header-bg); border-block-end: 1px solid var(--view-inner-rule); color: var(--muted); font: var(--font-body); }
    .notice.warn { color: var(--warning); }
    .notice > :global(button) { pointer-events: auto; }
    .message { margin: var(--space-2) var(--panel-inset); color: var(--muted); font: var(--font-body); }
</style>
