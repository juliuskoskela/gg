<script lang="ts">
    import type { Snippet } from "svelte";
    import ActionWidget from "../controls/ActionWidget.svelte";
    import ModalDialog from "./ModalDialog.svelte";

    interface Props {
        title: string;
        severe?: boolean;
        onClose?: (() => void) | null;
        children?: Snippet;
    }

    let {
        title,
        severe = false,
        onClose = null,
        children
    }: Props = $props();
</script>

<ModalDialog {title} error={severe} onCancel={() => onClose?.()}>
    {@render children?.()}

    {#snippet commands()}
        {#if onClose}
            <ActionWidget tip="Close dialog" safe onClick={onClose}>OK</ActionWidget>
        {/if}
    {/snippet}
</ModalDialog>
