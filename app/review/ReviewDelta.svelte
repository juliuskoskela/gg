<script lang="ts">
    import { onDestroy, untrack } from "svelte";
    import { query } from "../ipc";
    import type { RevId } from "../messages/RevId";
    import type { ReviewDelta } from "../messages/ReviewDelta";
    import { repoConfigEvent } from "../stores";
    import { repositoryScope } from "../workspace/repository";
    import DiffViewer from "../DiffViewer.svelte";
    import SelectWidget from "../controls/SelectWidget.svelte";
    import ActionWidget from "../controls/ActionWidget.svelte";

    let { from, to, path = null, title = "Changes since review", embedded = false }: {
        from: RevId; to: RevId; path?: string | null; title?: string; embedded?: boolean;
    } = $props();
    let result = $state.raw<ReviewDelta | null>(null);
    let loading = $state(false);
    let error = $state("");
    let selected = $state("");
    let generation = 0;
    let repository = $derived(repositoryScope($repoConfigEvent));
    let changes = $derived(result?.type === "Ready" ? result.changes : []);
    let change = $derived(changes.find(item => item.path.repo_path === selected));
    onDestroy(() => generation++);

    async function load() {
        let request = ++generation;
        let earlier = from, later = to, file = path;
        loading = true; error = ""; result = null;
        let response = await query<ReviewDelta>("query_review_delta", {
            request: { from: earlier, to: later, path: file, full_context: false },
        });
        if (request !== generation) return;
        if (response.type === "error") error = response.message;
        else {
            result = response.value;
            selected = result.type === "Ready" ? result.changes[0]?.path.repo_path ?? "" : "";
        }
        loading = false;
    }
    $effect(() => {
        let inputs = [from, to, path, repository];
        untrack(() => void load());
    });
    async function fullFiles() {
        let response = await query<ReviewDelta>("query_review_delta", {
            request: { from, to, path: selected, full_context: true },
        });
        if (response.type === "error") throw new Error(response.message);
        if (response.value.type !== "Ready") throw new Error(response.value.reason);
        let lines = response.value.changes[0]?.hunks.flatMap(hunk => hunk.lines.lines).filter(line => !line.startsWith("\\")) ?? [];
        return {
            before: lines.filter(line => !line.startsWith("+")).map(line => line.slice(1)).join(""),
            after: lines.filter(line => !line.startsWith("-")).map(line => line.slice(1)).join(""),
        };
    }
</script>

<section class="review-delta" class:embedded aria-label={title}>
    {#if !embedded}<h3>{title}</h3>{/if}
    <p class="comparison-note">Parent-only changes are excluded. From {from.commit.hex.slice(0, 8)} → to {to.commit.hex.slice(0, 8)}.</p>
    {#if loading}<p role="status">Comparing versions…</p>
    {:else if error}<p role="alert">Couldn’t compare versions: {error}</p><ActionWidget safe tip="Retry comparison" onClick={load}>Retry comparison</ActionWidget>
    {:else if result?.type === "Unavailable"}<p role="status">{result.reason}</p>
    {:else if result?.type === "Ready"}
        {#if result.description_before !== result.description_after}
            <details><summary>Description changed</summary><p>Earlier</p><pre>{result.description_before || "No description"}</pre><p>Later</p><pre>{result.description_after || "No description"}</pre></details>
        {/if}
        {#if changes.length}
            <SelectWidget label="Comparison file" options={changes.map(item => ({ value: item.path.repo_path, label: item.path.relative_path }))} bind:value={selected}>{#snippet children({ option })}{option.label}{/snippet}</SelectWidget>
            {#if change}
                {#if change.hunks.length}
                    {#key `${repository}:${from.commit.hex}:${to.commit.hex}:${selected}`}<DiffViewer {change} readingKey={`review:${from.commit.hex}:${to.commit.hex}:${selected}`} loadFullFiles={fullFiles} />{/key}
                {:else}<p>No text preview is available for this changed file.</p>{/if}
            {/if}
        {:else}<p>No code changes between these versions{path ? " for this file" : ""}.</p>{/if}
    {/if}
</section>

<style>
    .review-delta { min-width: 0; padding-block: var(--space-3); border-block-start: 1px solid var(--rule); }
    /* inside a section that already has a heading and rule */
    .embedded { padding-block: 0; border-block-start: 0; }
    h3 { font: var(--font-heading); margin: 0 0 var(--space-2); }
    p, pre { font: var(--font-body); overflow-wrap: anywhere; }
    pre { white-space: pre-wrap; }
    .comparison-note { color: var(--muted); font: var(--font-label); }
    .review-delta :global(.diff-viewer) { min-height: var(--space-6); margin-block-start: var(--space-3); }
</style>
