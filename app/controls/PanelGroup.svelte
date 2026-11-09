<script lang="ts">
    import type { Snippet } from "svelte";
    import { provideToolbars } from "../workspace/toolbars";
    interface Props {
        children?: Snippet;
    }

    let { children }: Props = $props();
    provideToolbars();
</script>

{@render children?.()}
