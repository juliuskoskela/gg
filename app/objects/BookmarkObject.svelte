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

    export let header: RevHeader;
    export let ref: Extract<StoreRef, { type: "LocalBookmark" | "RemoteBookmark" }>;

    let settings = getContext<Settings>("settings");

    $: operand = { type: "Ref", header, ref } as Operand;

    $: label = ref.type === "LocalBookmark" ? ref.bookmark_name : `${ref.bookmark_name}@${ref.remote_name}`;

    $: state = (
        ref.type === "LocalBookmark" ? (ref.is_synced ? "change" : "add") : ref.is_tracked ? "remove" : "change"
    ) as "add" | "change" | "remove";

    $: disconnected =
        settings.markUnpushedBookmarks &&
        (ref.type === "LocalBookmark"
            ? ref.available_remotes == 0 && ref.potential_remotes > 0
            : ref.is_tracked && ref.is_absent);

    $: defaultCommand = RefMutator.defaultCommand(ref);

    $: tip = bookmarkStatus(ref);
    $: lifecycleIcon = ref.has_conflict ? "alert-triangle" : ref.type === "RemoteBookmark" ? (ref.is_tracked ? (ref.is_absent ? "minus-circle" : "link") : "help-circle") : (!ref.is_synced ? "upload" : null);
</script>

<Object {operand} label={bookmarkLabel(ref)} {defaultCommand} conflicted={ref.has_conflict} let:context let:hint={dragHint}>
    <Zone {operand} let:target let:hint={dropHint}>
        <Chip {context} {target} {disconnected} {tip}>
            <Icon name="bookmark" state={context ? null : state} />
            {#if lifecycleIcon}<Icon name={lifecycleIcon} />{/if}
            <span>{dragHint ?? dropHint ?? label}</span>
        </Chip>
    </Zone>
</Object>
