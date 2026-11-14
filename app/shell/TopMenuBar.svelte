<script lang="ts">
    import { tick } from "svelte";
    import MenuSections from "../controls/MenuSections.svelte";
    import { menuBehavior, menuPosition } from "../controls/menu";
    import { appZoom, nativeZoomEnabled } from "../display/zoom";
    import { mutationPending } from "../operations";
    import { pluginContributions } from "../plugins/contributions";
    import { commandOperand, currentWorkspaceIdentity } from "../commands/context";
    import { buildTopMenus, type MenuEntry, type TopMenuId } from "../commands/menus";
    import { currentMutation, ignoreToggled, pickedRevisions, repoConfigEvent, repoStatusEvent, selectionHeaders } from "../stores";
    import type { PanelId } from "../workspace/dock";

    interface Props {
        refreshing?: boolean;
        onSettings: () => void;
        onHistory: () => void;
        onWorkingCopy: () => void;
        onPanel?: (id: PanelId) => void;
    }

    let {
        refreshing = false,
        onSettings,
        onHistory,
        onWorkingCopy,
        onPanel,
    }: Props = $props();

    let root!: HTMLDivElement;
    let list = $state<HTMLDivElement>();
    let triggers: (HTMLButtonElement | undefined)[] = $state([]);
    let openId = $state<TopMenuId | null>(null);
    let initialFocus = $state<"menu" | "first" | "last">("menu");
    let focusedIndex = $state(0);
    let position = $state("");

    let activeHeaders = $derived($pickedRevisions.length > 1 ? $pickedRevisions : $selectionHeaders);
    let menus = $derived.by(() => {
        // subscribe explicitly to reactive stores that command builders inspect
        void [$currentMutation, $mutationPending, $repoConfigEvent, $repoStatusEvent, $currentWorkspaceIdentity, $appZoom, $nativeZoomEnabled];
        return buildTopMenus({
            headers: activeHeaders,
            operand: $commandOperand,
            ignoreImmutable: $ignoreToggled,
            refreshing,
            extensions: $pluginContributions,
            onSettings,
            onHistory,
            onWorkingCopy,
            onPanel,
        });
    });
    let activeIndex = $derived(openId ? menus.findIndex(menu => menu.id === openId) : -1);
    let activeMenu = $derived(activeIndex >= 0 ? menus[activeIndex] : null);

    function isRtl() {
        return !!root && getComputedStyle(root).direction === "rtl";
    }

    async function openMenu(index: number, focus: "menu" | "first" | "last" = "menu") {
        let normalized = (index + menus.length) % menus.length;
        let target = menus[normalized];
        if (!target) return;
        focusedIndex = normalized;
        initialFocus = focus;
        openId = target.id;
        await tick();
        placeDropdown(normalized);
        if (list) {
            if (focus === "menu") list.focus({ preventScroll: true });
            else {
                let choices = [...list.querySelectorAll<HTMLButtonElement>('[role^="menuitem"]:not(:disabled)')];
                (focus === "first" ? choices[0] : choices.at(-1))?.focus({ preventScroll: true });
            }
        }
    }

    function placeDropdown(index: number) {
        let trigger = triggers[index];
        if (!trigger || !list) return;
        let bounds = trigger.getBoundingClientRect();
        // the dropdown hangs from the trigger's leading edge, which is its right edge in RTL
        let placed = isRtl()
            ? menuPosition({ x: bounds.right, y: bounds.bottom }, list.getBoundingClientRect(), "below-end")
            : menuPosition({ x: bounds.left, y: bounds.bottom }, list.getBoundingClientRect(), "below-start");
        position = `left: ${placed.left}px; top: ${placed.top}px;`;
    }

    async function activateItem(item: MenuEntry, menuIndex: number) {
        if (item.reason) return;
        let trigger = triggers[menuIndex];
        openId = null;
        if (item.opensModal) {
            await tick();
            trigger?.focus({ preventScroll: true });
        }
        await item.execute();
    }

    // ArrowRight moves to the next menu in reading order, so it goes backwards in RTL
    function horizontalStep(key: string): number {
        let step = key === "ArrowRight" ? 1 : key === "ArrowLeft" ? -1 : 0;
        return isRtl() ? -step : step;
    }

    function onTriggerKey(event: KeyboardEvent, index: number) {
        let step = horizontalStep(event.key);
        if (step) {
            event.preventDefault();
            let next = (index + step + menus.length) % menus.length;
            focusedIndex = next;
            if (openId) void openMenu(next, "first");
            else triggers[next]?.focus({ preventScroll: true });
        } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            void openMenu(index, event.key === "ArrowUp" ? "last" : "first");
        } else if (event.key === "Home" || event.key === "End") {
            event.preventDefault();
            let next = event.key === "Home" ? 0 : menus.length - 1;
            focusedIndex = next;
            triggers[next]?.focus({ preventScroll: true });
        } else if (event.key === "Escape" && openId) {
            event.preventDefault();
            openId = null;
        }
    }

    function onTriggerClick(event: MouseEvent, index: number) {
        if (openId === menus[index]?.id) { openId = null; return; }
        // Enter and Space click with detail 0; keyboard users land on the first item as in a native menu bar
        void openMenu(index, event.detail === 0 ? "first" : "menu");
    }

    function onTriggerHover(event: PointerEvent, index: number) {
        // a tap fires pointerenter just before its click, which would then close the menu it opened
        if (event.pointerType !== "mouse" || !openId || openId === menus[index]?.id) return;
        void openMenu(index, "menu");
    }

    function onDropdownKey(event: KeyboardEvent) {
        if (activeIndex < 0) return;
        let step = horizontalStep(event.key);
        if (step) {
            event.preventDefault();
            event.stopPropagation();
            void openMenu(activeIndex + step, "first");
        }
    }
</script>

<svelte:window
    onresize={() => { if (openId) openId = null; }}
    onpointerdown={event => {
        if (!openId) return;
        let node = event.target as Node;
        if (!root?.contains(node) && !list?.contains(node)) openId = null;
    }} />

<div class="top-menubar" role="menubar" aria-label="Application menu" bind:this={root}>
    {#each menus as menu, index (menu.id)}
        <button
            bind:this={triggers[index]}
            id="top-menu-trigger-{menu.id}"
            type="button"
            role="menuitem"
            class="menubar-trigger"
            tabindex={focusedIndex === index ? 0 : -1}
            aria-haspopup="menu"
            aria-expanded={openId === menu.id}
            aria-controls={openId === menu.id ? `top-menu-${menu.id}` : undefined}
            onfocus={() => focusedIndex = index}
            onpointerenter={event => onTriggerHover(event, index)}
            onclick={event => onTriggerClick(event, index)}
            onkeydown={event => onTriggerKey(event, index)}
        >{menu.label}</button>
    {/each}
</div>

{#if activeMenu}
    {#key activeMenu.id}
        <!-- svelte-ignore a11y_interactive_supports_focus (menuBehavior manages item focus) -->
        <div
            bind:this={list}
            id="top-menu-{activeMenu.id}"
            style={position}
            class="top-menu-dropdown"
            role="menu"
            tabindex="-1"
            aria-label={activeMenu.label}
            onkeydown={onDropdownKey}
            use:menuBehavior={{ onClose: () => { openId = null; }, returnFocus: triggers[activeIndex], initialFocus, followPointer: true }}
        >
            <MenuSections menu={activeMenu} idPrefix="top-menu-{activeMenu.id}" onActivate={item => void activateItem(item, activeIndex)} />
        </div>
    {/key}
{/if}

<style>
    .top-menubar { display: flex; align-items: center; gap: var(--gap-row); min-width: 0; overflow-x: auto; scrollbar-width: none; }
    .top-menubar::-webkit-scrollbar { display: none; }
    .menubar-trigger { flex: none; display: inline-flex; align-items: center; min-height: var(--control-height); padding: var(--space-1) var(--control-padding-inline); border: 0; border-radius: var(--radius-control); background: transparent; color: var(--text); font: var(--font-body); cursor: pointer; white-space: nowrap; }
    .menubar-trigger[aria-expanded="true"] { background: var(--interaction-selected, var(--hover)); color: var(--text-strong); }
    .menubar-trigger:focus-visible { outline: var(--focus-width) solid var(--focus-ring); outline-offset: calc(-1 * var(--focus-width)); }
    .menubar-trigger:active { background: var(--control-pressed); }

    .top-menu-dropdown { position: fixed; z-index: 80; min-width: 240px; max-width: min(380px, calc(100vw - 16px)); max-height: calc(100dvh - 16px); overflow-y: auto; overscroll-behavior: contain; display: grid; gap: 0; padding: var(--space-1); border: 1px solid var(--border); border-radius: var(--radius-popover); background: var(--popover-surface); box-shadow: var(--shadow-overlay); color: var(--text); pointer-events: auto; }
    .top-menu-dropdown:focus { outline: none; }
    @media (hover: hover) {
        .menubar-trigger:hover { background: var(--hover); }
    }
    @media (pointer: coarse), (max-width: 600px) {
        .top-menubar { gap: 0; }
        .menubar-trigger { min-height: var(--touch-target); padding-inline: var(--space-1); }
    }
    @media (forced-colors: active) {
        .top-menu-dropdown { background: Canvas; border-color: CanvasText; }
        .menubar-trigger[aria-expanded="true"] { background: Highlight; color: HighlightText; }
    }
</style>
