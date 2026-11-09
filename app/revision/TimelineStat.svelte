<script lang="ts">
    import { untrack } from "svelte";
    import type { RevId } from "../messages/RevId";
    import type { RevChange } from "../messages/RevChange";
    import { repoConfigEvent } from "../stores";
    import { repositoryScope } from "../workspace/repository";
    import DiffStat from "./DiffStat.svelte";
    import { timelineStats } from "./timelineStats";

    let { id }: { id: RevId } = $props();
    let changes = $state.raw<RevChange[] | null>(null);
    $effect(() => {
        let revision = id, repository = repositoryScope($repoConfigEvent);
        let disposed = false;
        let controller = new AbortController();
        changes = null;
        if (!repository || !revision.commit.hex) return;
        let timeout = setTimeout(() => {
            untrack(() => timelineStats(repository, revision, controller.signal)).then(value => { if (!disposed) changes = value; });
        }, 100);
        return () => { disposed = true; controller.abort(); clearTimeout(timeout); };
    });
</script>

{#if changes}<DiffStat {changes} />{/if}
