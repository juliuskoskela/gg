# Shared frontend controls

The controls share interaction behavior while preserving their roles and feature-specific content. This work implements issue #9 in separate menu, list and toolbar changes.

## Menus

`app/controls/menu.ts` supplies `menuBehavior`, a Svelte action, and `menuPosition`. ContextMenu, OptionsMenu and ViewsMenu use these functions. The action has no repository or command dependencies.

The owner renders native buttons with `menuitem`, `menuitemcheckbox` or `menuitemradio` roles and `tabindex="-1"`, inside a named, focusable menu. The owner decides which commands are available, how checked states are stored, when actions close the menu and how outside clicks dismiss it.

| Action parameter | Contract |
| --- | --- |
| `onClose` | Required callback for Escape and Tab; remove the menu or set its open state to false |
| `returnFocus` | Optional opener; otherwise use the element focused when the action was created |
| `initialFocus` | Optional menu, first item or last item; omit when the owner handles initial focus after layout |
| `followPointer` | Move the highlight/focus with pointer movement; context menus enable this |

Arrow keys wrap among enabled items. Home and End select the first and last item. Typing selects the next matching label. Escape restores the opener and stops propagation; Tab closes without preventing normal focus movement. Disposal restores focus only if focus still belongs to the menu, and removes all installed listeners. An external click must retain its new focus.

`menuPosition` clamps pointer, above-end and below-end placements to an eight-pixel viewport inset. The owner supplies measured dimensions and closes or repositions when the viewport changes. Tall content still needs its own scrolling and maximum height.

OptionsMenu's public props are `label`, `icon` and `options` (id, label, group, checked, onToggle). See the interactive example in `DesignSystem.svelte`. ContextMenu remains the repository command adapter; command availability does not move into the generic interaction code.

Verification covers keyboard-only opening, wrapping, type selection, disabled items, Escape restoration, Tab, listener disposal and viewport positioning. Existing browser scenarios and screenshots cover command execution and presentation.

## Lists

`app/controls/listNavigation.ts` shares behavior without forcing a graph, file tree and history list into one rendering component.

- `navigationIndex` computes clamped arrow, page, Home and End destinations. Empty lists and unrelated keys return no destination.
- `selectionAction` applies the timeline's range and scattered-selection rules. It returns an action; the caller owns selection state, mutations, focus and scrolling.
- `visibleItems` finds rendered, enabled DOM options. The file-tree option adapter and LogList use it; the tree keeps native folder disclosure.
- `virtualRange` computes a stable viewport pool with overscan. GraphLog retains slot-index keys and placeholder rotation; VirtualFileList retains file keys.
- `revealRow` computes the scroll offset needed to reveal a row, including a reserved footer area. Each caller chooses scroll timing and animation.

ListWidget retains its existing public `List` and `Selection` type exports. Its adapter dispatches planned actions to `selectRow`, `extendSelection`, `moveFocus`, `toggleRow`, `clearToggled` and `editRow`. Modified arrows preserve scattered selection; Shift extends the active end. Plain arrows collapse a range in the direction of travel. Page/Home/End preserve their established selection behavior.

File options move focus without selecting until activated. History rows move focus and selection together. These intentionally different policies stay with their owners. No shared controller stores repository state or imports transport, mutation or feature modules.

The keyboard checks cover reversed ranges, selection boundaries, missing optional capabilities, page movement, empty lists, scattered selection and focus/selection handoff. Virtualization checks cover viewport pools, overscan, footer clearance and stable graph slots.
