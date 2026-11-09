<script lang="ts">
    import type { RevHeader } from "../messages/RevHeader";
    import type { StoreRef } from "../messages/StoreRef";
    import Chip from "../controls/Chip.svelte";
    import Icon from "../controls/Icon.svelte";

    interface Props {
        header: RevHeader;
        ref: Extract<StoreRef, { type: "Tag" }>;
    }

    let { ref }: Props = $props();
</script>

<Chip tone="tag" context={false} target={false} immobile tip="tag">
    <Icon name="tag" />
    <span>{ref.tag_name}</span>
</Chip>
