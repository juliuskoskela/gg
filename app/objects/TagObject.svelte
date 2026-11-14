<script lang="ts">
    import type { Operand } from "../messages/Operand";
    import type { RevHeader } from "../messages/RevHeader";
    import type { StoreRef } from "../messages/StoreRef";
    import Chip from "../controls/Chip.svelte";
    import Icon from "../controls/Icon.svelte";
    import Object from "./Object.svelte";

    interface Props {
        header: RevHeader;
        ref: Extract<StoreRef, { type: "Tag" }>;
    }

    let { header, ref }: Props = $props();
    let operand = $derived({ type: "Ref", header, ref } as Operand);
</script>

<Object {operand} label={ref.tag_name} conflicted={false}>
    {#snippet children({ context })}
        <Chip tone="tag" {context} target={false} immobile tip="tag">
            <Icon name="tag" />
            <span>{ref.tag_name}</span>
        </Chip>
    {/snippet}
</Object>
