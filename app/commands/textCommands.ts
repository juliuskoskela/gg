import { copyText } from "../annotations/store";
import type { Command } from "./registry";

/** where the edit commands sit in a context menu: after the annotation group (9), before file commands */
export let EDIT_GROUP = 10;

/** what Cut, Copy, Paste and Select all need to know about whatever holds the text */
export interface TextTarget {
    selected: () => string;
    editable: boolean;
    /** passwords can be pasted into but never copied out */
    secret?: boolean;
    replaceSelection: (text: string) => void;
    selectAll: () => void;
    focus: () => void;
}

export function canReadClipboard(): boolean {
    return typeof navigator !== "undefined" && typeof navigator.clipboard?.readText === "function";
}

/** null when Paste can run; otherwise the reason it can't. Checked when the menu opens, so a denial hides the command instead of failing silently */
export async function pasteReason(): Promise<string | null> {
    if (!canReadClipboard()) return "Paste with Ctrl+V";
    try {
        // not every webview implements the permission names, and an unknown answer is not a refusal
        let status = await navigator.permissions?.query({ name: "clipboard-read" as PermissionName });
        if (status?.state === "denied") return "Paste with Ctrl+V";
    } catch { /* ask for the text when the command runs */ }
    return null;
}

export function editCommands(target: TextTarget, paste: string | null): Command[] {
    let selected = target.selected() !== "";
    let copyReason = target.secret ? "Passwords can’t be copied" : !selected ? "Select some text first" : null;
    let cutReason = !target.editable ? "This text is read only" : copyReason;
    return [
        { id: "text.cut", label: "Cut", icon: "scissors", scope: "Edit", group: EDIT_GROUP, shortcut: "Ctrl/⌘ X", reason: cutReason, execute: async () => {
            let text = target.selected();
            target.focus();
            if (text && await copyText(text)) { target.focus(); target.replaceSelection(""); }
        } },
        { id: "text.copy", label: "Copy", icon: "copy", scope: "Edit", group: EDIT_GROUP, shortcut: "Ctrl/⌘ C", reason: copyReason, execute: async () => {
            let text = target.selected();
            if (text) await copyText(text);
            target.focus();
        } },
        { id: "text.paste", label: "Paste", icon: "clipboard", scope: "Edit", group: EDIT_GROUP, shortcut: "Ctrl/⌘ V", reason: !target.editable ? "This text is read only" : paste, execute: async () => {
            target.focus();
            try {
                let text = await navigator.clipboard.readText();
                target.focus();
                if (text) target.replaceSelection(text);
            } catch { /* refused at the last moment; the keyboard shortcut still works */ }
        } },
        { id: "text.select-all", label: "Select all", icon: "type", scope: "Edit", group: EDIT_GROUP, shortcut: "Ctrl/⌘ A", reason: null, execute: () => { target.focus(); target.selectAll(); } },
    ];
}

export type TextField = HTMLInputElement | HTMLTextAreaElement;

let textual = new Set(["text", "search", "url", "tel", "password"]);
/** inputs with the selection API; email, number, checkboxes and buttons keep the ordinary menu */
export function isTextField(element: Element | null): element is TextField {
    if (element instanceof HTMLTextAreaElement) return true;
    return element instanceof HTMLInputElement && textual.has(element.type);
}

export function fieldTarget(field: TextField): TextTarget {
    let range = () => [field.selectionStart ?? 0, field.selectionEnd ?? 0] as const;
    return {
        selected: () => { let [from, to] = range(); return field.value.slice(from, to); },
        editable: !field.readOnly && !field.disabled,
        secret: field instanceof HTMLInputElement && field.type === "password",
        replaceSelection(text) {
            let [from, to] = range();
            field.setRangeText(text, from, to, "end");
            // bindings and handlers listen for input, which setRangeText doesn't fire
            field.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: text ? "insertFromPaste" : "deleteByCut" }));
        },
        selectAll: () => field.select(),
        focus: () => field.focus({ preventScroll: true }),
    };
}

export async function textFieldCommands(field: TextField): Promise<Command[]> {
    return editCommands(fieldTarget(field), await pasteReason());
}
