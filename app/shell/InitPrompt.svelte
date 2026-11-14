<script lang="ts">
    import { onMount } from "svelte";
    import ActionWidget from "../controls/ActionWidget.svelte";
    import Icon from "../controls/Icon.svelte";
    import { folderName, shortenHome, type InitTarget } from "./start";

    interface Props {
        target: InitTarget;
        home?: string | null;
        /** resolves to an error message, or null once the new workspace has opened */
        onInit: (path: string, colocated: boolean) => Promise<string | null>;
        onBack: () => void;
    }

    let { target, home = null, onInit, onBack }: Props = $props();

    // jj colocates by default, and an existing Git repository can only keep its history that way
    let colocate = $state(true);
    let busy = $state(false);
    let error: string | null = $state(null);
    let heading!: HTMLHeadingElement;
    let alive = true;

    let name = $derived(folderName(target.path));
    let shown = $derived(shortenHome(target.path, home));
    let nested = $derived(target.path !== target.opened);

    onMount(() => {
        heading.focus();
        return () => { alive = false; };
    });

    async function initialize() {
        if (busy) return;
        busy = true;
        error = null;
        let message = await onInit(target.path, target.colocateRequired || colocate);
        if (!alive) return;
        busy = false;
        error = message;
    }
</script>

<section class="init-prompt" aria-labelledby="init-heading" aria-busy={busy}>
    <h1 id="init-heading" class="title" tabindex="-1" bind:this={heading}>
        {target.git ? `Set up Jujutsu in ${name}` : `Initialize a repository in ${name}`}
    </h1>
    <p class="path" title={target.path}><bdi dir="ltr">{shown}</bdi></p>
    {#if target.git}
        <p>
            {#if nested}This folder is inside a Git repository. {/if}Initializing adds a Jujutsu repository {nested ? "at the top of the Git repository" : "to it"} and keeps its Git history. Git and jj stay in sync.
        </p>
    {:else}
        <p>This folder isn’t a Jujutsu repository yet. Initializing adds {colocate ? "the .jj and .git folders" : "a .jj folder"} to it and starts tracking your files; the files themselves stay as they are.</p>
    {/if}

    <label class="option">
        <input type="checkbox" bind:checked={colocate} disabled={target.colocateRequired || busy} aria-describedby="colocate-hint" />
        <span class="option-text">
            <span class="option-label">Colocate with Git</span>
            <span class="hint" id="colocate-hint">
                Git tools keep working in this folder.{#if target.colocateRequired}{" "}Needed to keep the existing Git history.{/if}
            </span>
        </span>
    </label>

    {#if error}
        <p class="problem" role="alert"><Icon name="alert-circle" /><span>{error}</span></p>
    {/if}

    <div class="actions">
        <ActionWidget safe primary disabled={busy} onClick={initialize}>{busy ? "Initializing…" : "Initialize repository"}</ActionWidget>
        <ActionWidget safe disabled={busy} onClick={onBack}>Choose another folder</ActionWidget>
    </div>
</section>

<style>
    .init-prompt { display: grid; gap: var(--gap-group); min-width: 0; }
    .title { margin: 0; color: var(--text-strong); font: var(--font-title); overflow-wrap: anywhere; }
    /* focus lands here so screen readers announce the question; it isn't a control, so it shows no ring */
    .title:focus { outline: none; }
    p { margin: 0; max-width: var(--prose-measure); font: var(--font-body); user-select: text; }
    .path { margin-block-start: calc(-1 * var(--space-2)); color: var(--muted); font: var(--font-id); overflow-wrap: anywhere; }
    .option { display: flex; align-items: flex-start; gap: var(--space-2); width: fit-content; max-width: 100%; padding-block: var(--space-1); cursor: pointer; }
    .option:has(input:disabled) { cursor: default; }
    .option input { flex: none; margin: 0; margin-block-start: var(--space-1); }
    .option input:focus-visible { outline: var(--focus-width) solid var(--focus-ring); outline-offset: var(--focus-offset); }
    .option-text { display: grid; min-width: 0; }
    .option-label { color: var(--text); font: var(--font-emphasis); }
    .hint { color: var(--muted); font: var(--font-label); }
    .problem { display: flex; align-items: flex-start; gap: var(--space-2); color: var(--negative); overflow-wrap: anywhere; --icon-size: 14px; }
    .problem :global(svg) { flex: none; margin-block-start: var(--space-1); }
    .actions { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); margin-block-start: var(--space-1); }
    @media (pointer: coarse), (max-width: 600px) { .option { min-height: var(--touch-target); align-items: center; } .option input { margin-block-start: 0; } }
</style>
