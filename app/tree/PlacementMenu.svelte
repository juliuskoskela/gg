<script lang="ts">
    import OptionsMenu from "../controls/OptionsMenu.svelte";
    import { PANE_SIDES, SIDE_LABELS, placementTransform, type PaneSide } from "./placement";

    interface Props {
        /** names the trigger, such as "Editor layout" */
        label: string;
        /** names the show and hide item, such as "File tree" */
        paneLabel: string;
        open: boolean;
        side: PaneSide;
        onOpen: (open: boolean) => void;
        onSide: (side: PaneSide) => void;
    }

    let { label, paneLabel, open, side, onOpen, onSide }: Props = $props();
</script>

<OptionsMenu {label} icon="sidebar" iconTransform={placementTransform(side)} options={[
    { id: "pane", label: paneLabel, group: 0, checked: open, onToggle: () => onOpen(!open) },
    ...PANE_SIDES.map(value => ({ id: value, label: SIDE_LABELS[value], group: 1, radio: true, checked: side === value, onToggle: () => onSide(value) })),
]} />
