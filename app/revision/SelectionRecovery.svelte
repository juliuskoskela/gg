<script lang="ts">
    import { selectionRecovery } from "./recovery";
    import { revisionSelectEvent } from "../stores";
    import type { RevHeader } from "../messages/RevHeader";
    function choose(header: RevHeader) {
        let recovery = $selectionRecovery;
        if (!recovery) return;
        let singleton = recovery.set.from.commit.hex === recovery.set.to.commit.hex;
        revisionSelectEvent.set(singleton ? { from: header.id, to: header.id } : { ...recovery.set, [recovery.endpoint]: header.id });
        selectionRecovery.set(null);
    }
</script>

{#if $selectionRecovery}
    <section class="selection-recovery" aria-label="Resolve revision selection">
        <p>{$selectionRecovery.message}</p>
        {#each $selectionRecovery.candidates as header}
            <button type="button" onclick={() => choose(header)}><span>{header.description.lines[0] || "(no description set)"}</span><small>Change {header.id.change.hex.slice(0, 8)} · Commit {header.id.commit.hex.slice(0, 8)}{header.has_conflict ? " · Conflict" : ""}</small></button>
        {/each}
    </section>
{/if}

<style>
    .selection-recovery { padding: 16px; display: grid; gap: var(--gap-row); font: var(--font-body); pointer-events: auto; }
    p { margin: 0; color: var(--muted); }
    button { text-align: start; padding: 10px; min-height: 44px; color: var(--text); background: var(--raised); border: 1px solid var(--border); border-radius: var(--radius-control); cursor: pointer; }
    span, small { display: block; overflow-wrap: anywhere; }
    small { margin-block-start: 4px; color: var(--muted); font: var(--font-label); }
</style>
