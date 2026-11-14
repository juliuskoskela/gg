<script lang="ts">
    import { revisionCommands } from "../commands/registry";
    import Icon from "../controls/Icon.svelte";
    import PanelTools from "../controls/PanelTools.svelte";
    import OptionsMenu from "../controls/OptionsMenu.svelte";
    import { historyDensity } from "../graphLayout";
    import { mutationPending } from "../operations";
    import { currentMutation, ignoreToggled, pickedRevisions, repoStatusEvent, selectionHeaders } from "../stores";
    import { timelineDisplay } from "./display";

    let primaryIds = ["new_child", "edit", "squash", "split", "abandon"];
    let headers = $derived($pickedRevisions.length > 1 ? $pickedRevisions : $selectionHeaders);
    let actions = $derived.by(() => {
        let all = revisionCommands(headers, false, $currentMutation, $mutationPending, $repoStatusEvent, $ignoreToggled);
        return primaryIds.map(id => all.find(command => command.id === id)).filter(command => command !== undefined);
    });
</script>

<PanelTools label="Timeline tools">
    <div class="timeline-actions" role="group" aria-label="Timeline quick actions">
        {#each actions as action (action.id)}
            <button
                type="button"
                class="action-button"
                class:destructive={action.destructive}
                aria-label={action.label}
                title={action.reason ? `${action.label} — ${action.reason}` : action.label}
                disabled={!!action.reason}
                onclick={() => action.execute()}>
                <Icon name={action.icon} />
            </button>
        {/each}
    </div>
    <OptionsMenu label="Timeline display" icon="eye" options={[
        { id: "authors", label: "Authors", group: 0, checked: $historyDensity === "tall", onToggle: () => historyDensity.set($historyDensity === "tall" ? "compact" : "tall") },
        { id: "change", label: "Change IDs", group: 1, checked: $timelineDisplay.change, onToggle: () => timelineDisplay.toggle("change") },
        { id: "commit", label: "Commit IDs", group: 1, checked: $timelineDisplay.commit, onToggle: () => timelineDisplay.toggle("commit") },
        { id: "stats", label: "Line counts", group: 2, checked: $timelineDisplay.stats, onToggle: () => timelineDisplay.toggle("stats") },
        { id: "bookmarks", label: "Bookmarks", group: 3, checked: $timelineDisplay.bookmarks, onToggle: () => timelineDisplay.toggle("bookmarks") },
        { id: "tags", label: "Tags", group: 3, checked: $timelineDisplay.tags, onToggle: () => timelineDisplay.toggle("tags") },
    ]} />
</PanelTools>

<style>
    .timeline-actions { display: inline-flex; align-items: center; gap: var(--gap-row); }
    .action-button {
        display: inline-grid;
        place-items: center;
        width: var(--panel-control-size);
        height: var(--panel-control-size);
        min-height: var(--panel-control-size);
        padding: 0;
        border: 0;
        border-radius: var(--radius-control);
        background: transparent;
        color: var(--muted);
        cursor: pointer;
        --icon-size: var(--space-4);
    }
    .action-button:disabled { color: var(--faint); cursor: default; }
    .action-button:focus-visible { outline: var(--focus-width) solid var(--focus-ring); outline-offset: calc(-1 * var(--focus-width)); }
    .action-button:not(:disabled):active { background: var(--interaction-pressed); }
    @media (hover: hover) {
        .action-button:not(:disabled):hover { background: var(--hover); color: var(--text); }
        .action-button.destructive:not(:disabled):hover { color: var(--negative); }
    }
    @media (pointer: coarse), (max-width: 600px) {
        .action-button { width: var(--touch-target); height: var(--touch-target); min-height: var(--touch-target); }
    }
</style>
