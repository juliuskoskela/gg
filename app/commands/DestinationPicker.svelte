<script lang="ts">
    import TextField from "../controls/TextField.svelte";
    import { tick } from "svelte";
    import { destinationRequest } from "./destination";
    import { revisionLabel } from "./registry";
    let dialog: HTMLDialogElement;
    let input: HTMLInputElement | undefined;
    let expression = "";
    let previous: HTMLElement | null = null;
    let shown = false;
    $: candidates = ($destinationRequest?.candidates ?? []).filter(candidate => !expression.trim() || revisionLabel(candidate).toLowerCase().includes(expression.trim().toLowerCase()));
    $: if ($destinationRequest && !shown) show();
    async function show() { shown = true; expression = ""; previous = document.activeElement as HTMLElement; await tick(); dialog.showModal(); input?.focus(); }
    function finish(value: string | null) { let request = $destinationRequest; dialog.close(); destinationRequest.set(null); shown = false; previous?.focus(); request?.resolve(value); }
</script>
{#if $destinationRequest}
    <dialog bind:this={dialog} aria-label={$destinationRequest.title} on:cancel|preventDefault={() => finish(null)}>
        <h2>{$destinationRequest.title}</h2>
        <label for="destination-expression">Bookmark or revset</label>
        <div class="input-row"><TextField id="destination-expression" bind:element={input} bind:value={expression} /><button type="button" disabled={!expression.trim()} on:click={() => finish(expression.trim())}>Use</button></div>
        {#if $destinationRequest.candidates.length}<p>Or choose a visible revision</p><div class="candidates">{#each candidates as candidate (candidate.id.commit.hex)}<button type="button" on:click={() => finish(candidate.id.commit.hex)}>{revisionLabel(candidate)}</button>{/each}</div>{/if}
        <button type="button" on:click={() => finish(null)}>Cancel</button>
    </dialog>
{/if}
<style>
    dialog { width: min(560px, calc(100% - 32px)); max-height: 75dvh; box-sizing: border-box; background: var(--raised); color: var(--text); border: 1px solid var(--border); border-radius: var(--radius-surface); padding: 16px; pointer-events: auto; }
    dialog::backdrop { background: var(--scrim); }
    h2 { margin: 0 0 12px; font-size: var(--type-title); }
    .input-row { display: flex; gap: 8px; } .input-row :global(.text-field) { min-width: 0; flex: 1; min-height: 44px; }
    button { min-height: 44px; } .candidates { max-height: 42dvh; overflow: auto; display: grid; pointer-events: auto; }
    .candidates button { text-align: left; color: inherit; background: transparent; border: 0; padding: 8px; }
    .candidates button:hover, .candidates button:focus { background: var(--hover); }
</style>
