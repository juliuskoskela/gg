<script lang="ts">
    import { tick } from "svelte";
    import { get } from "svelte/store";
    import { commandOperand } from "../commands/context";
    import { buildFileActionsMenu, type MenuEntry } from "../commands/menus";
    import MenuSections from "../controls/MenuSections.svelte";
    import { menuBehavior, menuPosition } from "../controls/menu";
    import ToggleItem from "../controls/ToggleItem.svelte";
    import type { RevChange } from "../messages/RevChange";
    import type { RevHeader } from "../messages/RevHeader";
    import { mutationPending } from "../operations";
    import { changeSelectEvent, currentMutation, ignoreToggled, repoConfigEvent, repoStatusEvent } from "../stores";

    interface Props {
        change: RevChange;
        headers: RevHeader[];
    }

    let { change, headers }: Props = $props();

    let root!: HTMLDivElement;
    let trigger = $state<HTMLButtonElement>();
    let list = $state<HTMLDivElement>();
    let open = $state(false);
    let initialFocus = $state<"menu" | "first" | "last">("menu");
    let position = $state("");
    let menuId = `diff-file-actions-${Math.random().toString(36).slice(2, 8)}`;

    let menu = $derived.by(() => {
        void [$currentMutation, $mutationPending, $repoConfigEvent, $repoStatusEvent, $ignoreToggled, $changeSelectEvent];
        return buildFileActionsMenu({
            change,
            headers,
            operand: $commandOperand,
        });
    });

    async function show(focus: "menu" | "first" | "last" = "menu") {
        if (get(changeSelectEvent)?.path.repo_path !== change.path.repo_path) {
            changeSelectEvent.set(change);
        }
        initialFocus = focus;
        open = true;
        await tick();
        if (trigger && list) {
            let bounds = trigger.getBoundingClientRect();
            // the trigger sits at the trailing edge, so the dropdown grows back towards the content
            let placed = getComputedStyle(trigger).direction === "rtl"
                ? menuPosition({ x: bounds.left, y: bounds.bottom }, list.getBoundingClientRect(), "below-start")
                : menuPosition({ x: bounds.right, y: bounds.bottom }, list.getBoundingClientRect(), "below-end");
            position = `left: ${placed.left}px; top: ${placed.top}px;`;
        }
        if (list) {
            if (focus === "menu") list.focus({ preventScroll: true });
            else {
                let choices = [...list.querySelectorAll<HTMLButtonElement>('[role^="menuitem"]:not(:disabled)')];
                (focus === "first" ? choices[0] : choices.at(-1))?.focus({ preventScroll: true });
            }
        }
    }

    async function activateItem(item: MenuEntry) {
        if (item.reason) return;
        open = false;
        if (item.opensModal) {
            await tick();
            trigger?.focus({ preventScroll: true });
        }
        await item.execute();
    }

    function onTriggerKey(event: KeyboardEvent) {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            void show(event.key === "ArrowUp" ? "last" : "first");
        }
    }
</script>

<svelte:window
    onresize={() => { if (open) open = false; }}
    onpointerdown={event => {
        if (!open) return;
        let node = event.target as Node;
        if (!root?.contains(node) && !list?.contains(node)) open = false;
    }} />

<div class="file-actions" bind:this={root}>
    <ToggleItem
        kind="menu"
        on={open}
        icon="file-text"
        text="Changes"
        tip="Actions for {change.path.repo_path}"
        controls={open ? menuId : undefined}
        bind:element={trigger}
        onClick={event => open ? open = false : void show(event.detail === 0 ? "first" : "menu")}
        onKeyDown={onTriggerKey}
    />
</div>

{#if open}
    <!-- svelte-ignore a11y_interactive_supports_focus (menuBehavior manages item focus) -->
    <div
        bind:this={list}
        id={menuId}
        style={position}
        class="file-actions-dropdown"
        role="menu"
        tabindex="-1"
        aria-label={menu.label}
        use:menuBehavior={{ onClose: () => { open = false; }, returnFocus: trigger, initialFocus, followPointer: true }}
    >
        <MenuSections {menu} idPrefix={menuId} onActivate={item => void activateItem(item)} />
    </div>
{/if}

<style>
    .file-actions { position: relative; display: inline-flex; flex: none; }
    .file-actions-dropdown { position: fixed; z-index: 80; min-width: 240px; max-width: min(380px, calc(100vw - 16px)); max-height: calc(100dvh - 16px); overflow-y: auto; overscroll-behavior: contain; display: grid; gap: 0; padding: var(--space-1); border: var(--line-width) solid var(--line-popover); border-radius: var(--radius-popover); background: var(--popover-surface); box-shadow: var(--shadow-overlay); color: var(--text); pointer-events: auto; }
    .file-actions-dropdown:focus { outline: none; }
</style>
