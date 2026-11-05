export function navigateOptions(event: KeyboardEvent) {
    if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
    let target = (event.target as Element).closest<HTMLElement>('[role="option"]');
    if (!target) return;
    let options = [...(event.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('[role="option"]')]
        .filter(option => option.getClientRects().length > 0);
    let index = options.indexOf(target);
    if (index < 0) return;
    event.preventDefault();
    let next = event.key === "Home" ? 0 : event.key === "End" ? options.length - 1 : Math.max(0, Math.min(options.length - 1, index + (event.key === "ArrowDown" ? 1 : -1)));
    options[next]?.focus();
}
