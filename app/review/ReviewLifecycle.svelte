<script lang="ts">
    import { untrack } from "svelte";
    import { repoConfigEvent, repoStatusEvent } from "../stores";
    import { repositoryScope } from "../workspace/repository";
    import { refreshReviewProgress, resetReviewProgress } from "./progress";

    $effect(() => {
        let config = $repoConfigEvent, status = $repoStatusEvent;
        untrack(() => {
            resetReviewProgress(repositoryScope(config));
            if (config.type === "Workspace" && status) refreshReviewProgress();
        });
    });
</script>

<svelte:window onfocus={() => refreshReviewProgress()} />
