<script lang="ts">
    import type { RevHeader } from "../messages/RevHeader";
    import { revisionCommands } from "../commands/registry";
    import { mutationPending } from "../operations";
    import { currentMutation, ignoreToggled, revisionSelectEvent } from "../stores";
    import Icon from "../controls/Icon.svelte";

    export let headers: RevHeader[];

    let groups = ["Create", "Rewrite", "Remove"];
    $: commands = revisionCommands(headers, true, $currentMutation, $mutationPending, $ignoreToggled, $revisionSelectEvent);
</script>

<div class="revision-tools">
    {#if !headers.length}
        <p class="selection-hint" role="status">Select a revision to use these tools.</p>
    {/if}
    {#each groups as label, index}
        <section aria-label={label}>
            <h3>{label}</h3>
            <div class="commands">
                {#each commands.filter(command => command.group === index) as command (command.id)}
                    <button type="button" class:destructive={command.destructive} disabled={!!command.reason} aria-describedby={command.reason ? `revision-tool-${command.id}-reason` : undefined} on:click={() => command.execute()}>
                        <Icon name={command.icon} />
                        <span class="command-copy">
                            <span>{command.label}</span>
                            {#if command.reason}<small id={`revision-tool-${command.id}-reason`}>{command.reason}</small>{/if}
                        </span>
                    </button>
                {/each}
            </div>
        </section>
    {/each}
</div>

<style>
    .revision-tools { min-width: 0; min-height: 0; overflow: auto; overscroll-behavior: contain; pointer-events: auto; background: var(--surface); padding: 8px 12px 16px; }
    section { min-width: 0; padding-block: 8px; }
    section + section { border-block-start: 1px solid var(--border); }
    h3 { margin: 0; padding: 4px 8px 8px; color: var(--muted); font-size: var(--type-caption); font-weight: 500; line-height: 1.5; }
    .commands { display: grid; gap: 2px; }
    button { display: flex; align-items: flex-start; gap: 10px; width: 100%; min-height: var(--control-height); padding: 7px 8px; border: 0; border-radius: var(--radius-control); background: transparent; color: var(--text); text-align: start; white-space: normal; }
    button :global(svg) { flex: 0 0 var(--icon-size); width: var(--icon-size); height: var(--icon-size); margin-block-start: 3px; }
    .command-copy { display: grid; gap: 2px; min-width: 0; overflow-wrap: anywhere; line-height: 1.5; }
    small { color: var(--muted); font-size: var(--type-caption); }
    button:disabled { opacity: 1; color: var(--text-disabled); cursor: default; }
    button.destructive:not(:disabled) { color: var(--negative); }
    .selection-hint { margin: 0; padding: 8px; font-size: var(--type-ui); line-height: 1.5; color: var(--muted); }
    @media (hover: hover) { button:not(:disabled):hover { background: var(--hover); } }
    button:not(:disabled):active { background: var(--control-pressed); }
    @media (pointer: coarse) { button { min-height: 44px; } }
</style>
