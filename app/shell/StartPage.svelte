<script lang="ts">
    import { tick } from "svelte";
    import ActionWidget from "../controls/ActionWidget.svelte";
    import Icon from "../controls/Icon.svelte";
    import TextField from "../controls/TextField.svelte";
    import InitPrompt from "./InitPrompt.svelte";
    import RecentWorkspaceList from "./RecentWorkspaceList.svelte";
    import { initTarget, loadProblem, type LoadError } from "./start";

    interface Props {
        config: LoadError;
        desktop: boolean;
        recentWorkspaces: string[];
        onOpen: (path: string) => void;
        onInit: (path: string, colocated: boolean) => Promise<string | null>;
        onChoose: () => void;
        onInitialize: () => void;
        onClone: () => void;
    }

    let { config, desktop, recentWorkspaces, onOpen, onInit, onChoose, onInitialize, onClone }: Props = $props();

    let path = $state("");
    let field: HTMLInputElement | undefined = $state();
    // the prompt belongs to one load result; going back dismisses it until another folder is opened
    let dismissed: LoadError | null = $state.raw(null);
    let target = $derived(dismissed === config ? null : initTarget(config));
    let problem = $derived(loadProblem(config, recentWorkspaces));
    let home = $derived(config.home_dir ?? null);

    $effect.pre(() => { path = config.absolute_path; });

    function open() {
        let trimmed = path.trim();
        if (trimmed) onOpen(trimmed);
    }

    async function back() {
        dismissed = config;
        await tick();
        field?.focus();
        field?.select();
    }
</script>

<div class="start-page">
    <header class="start-topbar" data-tauri-drag-region>
        <bdi class="product">GG+</bdi>
    </header>
    <main class="start-sheet">
        <div class="start-column">
            {#if target}
                <InitPrompt {target} {home} {onInit} onBack={back} />
            {:else}
                <section class="open" aria-labelledby="open-heading">
                    <h1 id="open-heading" class="title">Open a repository</h1>
                    <p class="lead">Choose a folder with a Jujutsu or Git repository. A folder without one can be initialized.</p>
                    {#if problem}
                        <p class="problem" role="alert"><Icon name="alert-circle" /><span>{problem}</span></p>
                    {/if}
                    <form class="open-form" onsubmit={event => { event.preventDefault(); open(); }}>
                        <label for="workspace-path">Folder</label>
                        <div class="open-row">
                            <TextField id="workspace-path" bind:element={field} bind:value={path} placeholder="~/path/to/repository"
                                autocapitalize="off" autocomplete="off" spellcheck="false" dir="ltr" />
                            <ActionWidget safe primary disabled={!path.trim()} onClick={open}>Open</ActionWidget>
                        </div>
                    </form>
                    {#if desktop}
                        <div class="actions" role="group" aria-label="Other ways to start">
                            <ActionWidget safe onClick={onChoose}><Icon name="folder" />Choose folder…</ActionWidget>
                            <ActionWidget safe onClick={onClone}><Icon name="download-cloud" />Clone repository…</ActionWidget>
                            <ActionWidget safe onClick={onInitialize}><Icon name="plus-circle" />Initialize repository…</ActionWidget>
                        </div>
                    {/if}
                </section>
                {#if recentWorkspaces.length}
                    <section class="recent" aria-labelledby="recent-workspaces-heading">
                        <h2 id="recent-workspaces-heading" class="section-title">Recent workspaces</h2>
                        <RecentWorkspaceList workspaces={recentWorkspaces} {home} {onOpen} />
                    </section>
                {/if}
            {/if}
        </div>
    </main>
</div>

<style>
    .start-page { display: grid; grid-template-rows: auto minmax(0, 1fr); min-height: 0; min-width: 0; background: var(--ground); }
    /* app chrome on the ground, like the workspace topbar; it also carries the window drag region */
    .start-topbar { display: flex; align-items: center; min-height: 40px; padding: max(var(--space-1), env(safe-area-inset-top)) max(var(--pane-inset), env(safe-area-inset-right)) var(--space-1) max(var(--pane-inset), env(safe-area-inset-left)); pointer-events: auto; }
    :global(.overlay-titlebar) .start-topbar {
        /* design-token-allow spacing: clears the macOS traffic lights, as the workspace topbar does */
        padding-inline-start: 80px;
    }
    .product { color: var(--muted); font: var(--font-emphasis); pointer-events: none; }
    /* one view on the sheet: its seam meets the topbar like the workspace sheet's does */
    /* the free space above the column is a quarter of what's left, so it sits high without hugging the top */
    .start-sheet { display: grid; grid-template-rows: minmax(0, 1fr) auto minmax(0, 3fr); min-height: 0; overflow: auto; overscroll-behavior: contain; background: var(--surface); border-block-start: var(--line-width) solid var(--line-seam); }
    .start-column { grid-row: 2; display: grid; align-content: start; gap: var(--gap-section); width: min(100%, 640px); margin-inline: auto; padding: var(--space-6) var(--space-5); }
    .open { display: grid; gap: var(--gap-group); min-width: 0; }
    .title { margin: 0; color: var(--text-strong); font: var(--font-title); }
    p { margin: 0; max-width: var(--prose-measure); font: var(--font-body); user-select: text; }
    .lead { color: var(--muted); }
    .problem { display: flex; align-items: flex-start; gap: var(--space-2); color: var(--negative); overflow-wrap: anywhere; --icon-size: 14px; }
    .problem :global(svg) { flex: none; margin-block-start: var(--space-1); }
    .open-form { display: grid; gap: var(--space-1); min-width: 0; }
    label { color: var(--muted); font: var(--font-label); }
    .open-row { display: flex; gap: var(--space-2); min-width: 0; }
    .open-row :global(input) { flex: 1; unicode-bidi: plaintext; }
    .actions { display: flex; flex-wrap: wrap; gap: var(--space-1); margin-inline-start: calc(-1 * var(--control-padding-inline)); }
    .actions :global(svg) { color: var(--muted); --icon-size: 14px; }
    /* sections inside a view are divided by a rule */
    .recent { display: grid; min-width: 0; padding-block-start: var(--gap-section); border-block-start: var(--line-width) solid var(--line-rule); }
    .section-title { margin: 0 0 var(--space-2); color: var(--text-strong); font: var(--font-heading); }
    @media (max-width: 600px) {
        .start-column { padding: var(--space-5) var(--space-4) var(--space-6); }
        .start-topbar { min-height: 52px; }
        .actions { margin-inline-start: 0; display: grid; justify-items: start; }
    }
</style>
