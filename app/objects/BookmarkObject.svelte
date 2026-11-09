<script lang="ts">
    import { bookmarkLabel, bookmarkStatus } from "../revisionStatus";
    import { getContext } from "svelte";
    import type { RevHeader } from "../messages/RevHeader";
    import type { StoreRef } from "../messages/StoreRef";
    import type { Operand } from "../messages/Operand";
    import type Settings from "../shell/Settings";
    import Icon from "../controls/Icon.svelte";
    import Chip from "../controls/Chip.svelte";
    import Object from "./Object.svelte";
    import Zone from "./Zone.svelte";
    import RefMutator from "../mutators/RefMutator";

    interface Props {
        header: RevHeader;
        ref: Extract<StoreRef, { type: "LocalBookmark" | "RemoteBookmark" }>;
    }

    let { header, ref }: Props = $props();

    let settings = getContext<Settings>("settings");

    let operand = $derived({ type: "Ref", header, ref } as Operand);

    let label = $derived(ref.type === "LocalBookmark" ? ref.bookmark_name : `${ref.bookmark_name}@${ref.remote_name}`);

    let disconnected =
        $derived(settings.markUnpushedBookmarks &&
        (ref.type === "LocalBookmark"
            ? ref.available_remotes == 0 && ref.potential_remotes> 0
            : ref.is_tracked && ref.is_absent));

    let defaultCommand = $derived(RefMutator.defaultCommand(ref));

    let tip = $derived(bookmarkStatus(ref));
    let lifecycleIcon = $derived(ref.has_conflict ? "alert-triangle" : ref.type === "RemoteBookmark" ? (ref.is_tracked ? (ref.is_absent ? "minus-circle" : "link") : "help-circle") : (!ref.is_synced ? "upload" : null));
</script>

<Object {operand} label={bookmarkLabel(ref)} {defaultCommand} conflicted={ref.has_conflict}>
    {#snippet children({ context, hint: dragHint })}
    <Zone {operand}>
    {#snippet children({ target, hint: dropHint })}
        <Chip tone={ref.type === "LocalBookmark" ? "bookmark" : "remote"} {context} {target} {disconnected} {tip}>
            <Icon name="bookmark" />
            {#if lifecycleIcon}<Icon name={lifecycleIcon} state={ref.has_conflict ? "remove" : null} />{/if}
            <span>{dragHint ?? dropHint ?? label}</span>
        </Chip>

    {/snippet}
</Zone>

    {/snippet}
</Object>
