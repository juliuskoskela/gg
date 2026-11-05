<script lang="ts">
    import type { RevHeader } from "../messages/RevHeader";
    import type { ChangeHunk } from "../messages/ChangeHunk";
    import type { TreePath } from "../messages/TreePath";
    import type { Operand } from "../messages/Operand";
    import Object from "./Object.svelte";
    import Zone from "./Zone.svelte";
    import { commandOperand } from "../commands/context";

    export let header: RevHeader | null;
    export let path: TreePath;
    export let hunk: ChangeHunk;

    $: operand = (
        header == null
            ? null
            : {
                  type: "Change",
                  headers: [header],
                  path,
                  hunk,
              }) satisfies Operand | null;

    function getHunkDescription(hunk: ChangeHunk): string {
        return `@@ -${hunk.location.from_file.start},${hunk.location.from_file.len} +${hunk.location.to_file.start},${hunk.location.to_file.len} @@`;
    }
</script>

<Object {operand} tabIndex={0} selected={$commandOperand === operand} conflicted={false} label={getHunkDescription(hunk)} let:context let:hint={dragHint}>
    <Zone {operand} let:target let:hint={dropHint}>
        <div class="hunk" class:target>
            {dragHint ?? dropHint ?? getHunkDescription(hunk)}
        </div>
    </Zone>
</Object>

<style>
    .hunk {
        margin: 0;
        text-align: start; font-family: var(--stack-code); font-size: var(--type-code); color: var(--muted);
        background: var(--raised);
        padding: 6px 8px; border-radius: var(--radius-sm); margin-block: 2px;
    }

    .target {
        color: var(--text);
        outline: 2px solid var(--text);
        outline-offset: -2px;
        border-radius: var(--radius-control);
    }
    @media (pointer: coarse), (max-width: 600px) {
        .hunk { min-height: 44px; display: flex; align-items: center; }
    }
</style>
