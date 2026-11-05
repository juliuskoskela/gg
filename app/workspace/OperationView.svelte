<script lang="ts">
    import { onDestroy } from "svelte";
    import type { RepoStatus } from "../messages/RepoStatus";
    import type { OperationPreflight } from "../messages/OperationPreflight";
    import { query } from "../ipc";
    import { repositoryCommands } from "../commands/registry";
    import { currentMutation } from "../stores";
    import { mutationPending } from "../operations";
    export let status: RepoStatus | undefined = undefined;
    let undo: OperationPreflight | null = null;
    let redo: OperationPreflight | null = null;
    let error = "";
    let request = 0;
    $: if (status) load(status); else { request++; undo = null; redo = null; }
    onDestroy(() => request++);
    async function load(_status: RepoStatus) {
        let current = ++request;
        undo = null; redo = null; error = "";
        let [undoResult, redoResult] = await Promise.all([
            query<OperationPreflight>("query_operation_preflight", { redo: false }),
            query<OperationPreflight>("query_operation_preflight", { redo: true }),
        ]);
        if (current !== request) return;
        if (undoResult.type === "data") undo = undoResult.value; else if (undoResult.type === "error") error = undoResult.message;
        if (redoResult.type === "data") redo = redoResult.value; else if (redoResult.type === "error") error = redoResult.message;
    }
    function short(text: string): string { return text.replace(/\b[0-9a-f]{12,}\b/gi, value => value.slice(0, 8)); }
    function execute(id: string) { repositoryCommands().find(command => command.id === id)?.execute(); }
</script>

<section aria-label="Current operation">
    <h2>Current operation</h2>
    {#if status}<p title={status.operation_description}>{short(status.operation_description)}</p>{:else}<p>Operation information is unavailable.</p>{/if}
    <p class="hint">Working-copy changes are recorded before Undo.</p>
    {#if error}<p role="alert">Couldn’t check operation availability: {error}</p>{/if}
    {#each [{ name: "Undo", id: "repository.undo", result: undo }, { name: "Redo", id: "repository.redo", result: redo }] as action}
        <div class="operation-action"><button type="button" disabled={!action.result?.eligible || !!$currentMutation || $mutationPending} on:click={() => execute(action.id)}>{action.name}</button>
            {#if action.result?.description}<span title={action.result.description}>{short(action.result.description)}</span>{/if}
            {#if action.result && !action.result.eligible}<small>{action.result.reason ?? "Unavailable"}</small>{:else if !action.result && !error}<small>Checking…</small>{/if}
        </div>
    {/each}
</section>

<style>
    section { display: grid; align-content: start; gap: 12px; padding: 12px var(--panel-inset); min-height: 0; overflow: auto; font-size: var(--type-ui); }
    h2 { font-size: var(--type-title); }
    p, span, small { overflow-wrap: anywhere; }
    .hint, small { color: var(--muted); }
    .operation-action { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
    button { min-height: 36px; padding: 6px 12px; border: 1px solid var(--border); border-radius: var(--radius-control); color: var(--text); background: var(--surface); }
    button:disabled { color: var(--text-disabled); }
</style>
