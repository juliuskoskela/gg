<script lang="ts">
    import type { RevId } from "../messages/RevId";
    import { pickedRevisions, revisionSelectEvent } from "../stores";
    import { workspaceController } from "../workspace/state";
    let { origin, path }: { origin: RevId; path?: string } = $props();
    function open() {
        pickedRevisions.set([]);
        revisionSelectEvent.set({ from: origin, to: origin });
        workspaceController.selectRevision({ from: origin, to: origin });
        if (path) workspaceController.setFile(path);
    }
</script>
<button type="button" class="text-link origin" title={`Open originating change ${origin.change.hex}`} onclick={open}>{origin.change.hex.slice(0, 8)}</button>
<style>.origin { font: var(--font-id); white-space: nowrap; }</style>
