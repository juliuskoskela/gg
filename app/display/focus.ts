// browsers may carry a text field's focus-visible state back to a mouse-opened trigger.
export function focusModality(node: HTMLElement) {
    let document = node.ownerDocument;
    node.dataset.focusModality = "keyboard";
    function pointer() { node.dataset.focusModality = "pointer"; }
    function key(event: KeyboardEvent) {
        let editing = event.target instanceof Element && event.target.matches("input, textarea, select, [contenteditable]:not([contenteditable=false])");
        if ((event.key !== " " || !editing) && (["Tab", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End", "Enter", " "].includes(event.key) || event.ctrlKey || event.metaKey)) node.dataset.focusModality = "keyboard";
    }
    document.addEventListener("pointerdown", pointer, true);
    document.addEventListener("keydown", key, true);
    return { destroy() { document.removeEventListener("pointerdown", pointer, true); document.removeEventListener("keydown", key, true); delete node.dataset.focusModality; } };
}
