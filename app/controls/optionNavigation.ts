import { navigationIndex, visibleItems } from "./listNavigation";

export function navigateOptions(event: KeyboardEvent) {
    let target = (event.target as Element).closest<HTMLElement>('[role="option"]');
    if (!target) return;
    let options = visibleItems(event.currentTarget as HTMLElement, '[role="option"]');
    let index = options.indexOf(target);
    if (index < 0) return;
    // option lists leave page keys to their scroll container.
    if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
    let next = navigationIndex(event.key, index, options.length);
    if (next === null) return;
    event.preventDefault();
    options[next]?.focus();
}
