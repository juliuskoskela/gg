<script lang="ts">
    import type { Snippet } from "svelte";
    import { provideToolbars } from "./toolbars";
    interface Props {
        children?: Snippet;
    }

    let { children }: Props = $props();
    provideToolbars();
</script>

{@render children?.()}
