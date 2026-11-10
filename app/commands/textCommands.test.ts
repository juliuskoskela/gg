import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { editCommands, fieldTarget, isTextField, pasteReason, textFieldCommands, EDIT_GROUP } from "./textCommands";

let written: string[];
let clipboard: string;
function stubClipboard(extra: Record<string, unknown> = {}) {
    Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { writeText: vi.fn(async (text: string) => { written.push(text); clipboard = text; }), readText: vi.fn(async () => clipboard), ...extra },
    });
}
function field(value: string, from: number, to: number) {
    let element = document.body.appendChild(document.createElement("input"));
    element.value = value;
    element.focus();
    element.setSelectionRange(from, to);
    return element;
}
let byId = (commands: Awaited<ReturnType<typeof textFieldCommands>>, id: string) => commands.find(command => command.id === id)!;

describe("text commands", () => {
    beforeEach(() => { written = []; clipboard = ""; stubClipboard(); });
    afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); });

    it("offers cut, copy, paste and select all with their shortcuts in one group", async () => {
        let commands = await textFieldCommands(field("hello world", 0, 5));
        expect(commands.map(command => [command.label, command.shortcut])).toEqual([["Cut", "Ctrl/⌘ X"], ["Copy", "Ctrl/⌘ C"], ["Paste", "Ctrl/⌘ V"], ["Select all", "Ctrl/⌘ A"]]);
        expect(new Set(commands.map(command => command.group))).toEqual(new Set([EDIT_GROUP]));
        expect(commands.every(command => command.reason === null)).toBe(true);
    });

    it("hides cut and copy without a selection, and cut and paste in a read-only field", async () => {
        let empty = await textFieldCommands(field("abc", 1, 1));
        expect(byId(empty, "text.cut").reason).toBe("Select some text first");
        expect(byId(empty, "text.copy").reason).toBe("Select some text first");
        expect(byId(empty, "text.paste").reason).toBeNull();
        let readOnly = field("abc", 0, 3);
        readOnly.readOnly = true;
        let commands = await textFieldCommands(readOnly);
        expect(byId(commands, "text.cut").reason).toBe("This text is read only");
        expect(byId(commands, "text.paste").reason).toBe("This text is read only");
        expect(byId(commands, "text.copy").reason).toBeNull();
    });

    it("never copies out of a password field", async () => {
        let secret = field("hunter2", 0, 7);
        secret.type = "password";
        let commands = await textFieldCommands(secret);
        expect(byId(commands, "text.copy").reason).toBe("Passwords can’t be copied");
        expect(byId(commands, "text.cut").reason).toBe("Passwords can’t be copied");
    });

    it("copies the selection, and cut also removes it and tells listeners", async () => {
        let input = field("hello world", 6, 11);
        let events: string[] = [];
        input.addEventListener("input", () => events.push(input.value));
        let commands = await textFieldCommands(input);
        await byId(commands, "text.copy").execute();
        expect(written).toEqual(["world"]);
        await byId(commands, "text.cut").execute();
        expect(input.value).toBe("hello ");
        expect(events).toEqual(["hello "]);
        expect(document.activeElement).toBe(input);
    });

    it("pastes over the selection and selects everything", async () => {
        clipboard = "there";
        let input = field("hello world", 6, 11);
        let commands = await textFieldCommands(input);
        await byId(commands, "text.paste").execute();
        expect(input.value).toBe("hello there");
        expect(input.selectionStart).toBe(11);
        byId(commands, "text.select-all").execute();
        expect([input.selectionStart, input.selectionEnd]).toEqual([0, 11]);
    });

    it("falls back to the copy command when the clipboard API refuses to write", async () => {
        stubClipboard({ writeText: vi.fn(async () => { throw new Error("denied"); }) });
        let exec = vi.spyOn(document, "execCommand").mockReturnValue(true);
        let commands = await textFieldCommands(field("abc", 0, 3));
        await byId(commands, "text.copy").execute();
        expect(exec).toHaveBeenCalledWith("copy");
    });

    it("gives Paste a reason where reading the clipboard is unavailable or denied", async () => {
        Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => {} } });
        expect(await pasteReason()).toBe("Paste with Ctrl+V");
        stubClipboard();
        vi.spyOn(navigator.permissions, "query").mockResolvedValue({ state: "denied" } as PermissionStatus);
        expect(await pasteReason()).toBe("Paste with Ctrl+V");
        vi.spyOn(navigator.permissions, "query").mockRejectedValue(new TypeError("unknown permission"));
        expect(await pasteReason()).toBeNull();
        let commands = editCommands(fieldTarget(field("a", 0, 1)), "Paste with Ctrl+V");
        expect(commands.find(command => command.id === "text.paste")!.reason).toBe("Paste with Ctrl+V");
    });

    it("does nothing when a refused paste throws at the last moment", async () => {
        stubClipboard({ readText: vi.fn(async () => { throw new Error("denied"); }) });
        let input = field("abc", 0, 3);
        let commands = await textFieldCommands(input);
        await byId(commands, "text.paste").execute();
        expect(input.value).toBe("abc");
    });

    it("recognises fields with a selection API and leaves checkboxes and email inputs alone", () => {
        let make = (type: string) => { let input = document.createElement("input"); input.type = type; return input; };
        expect(["text", "search", "url", "tel", "password"].every(type => isTextField(make(type)))).toBe(true);
        expect(["checkbox", "email", "number", "button"].some(type => isTextField(make(type)))).toBe(false);
        expect(isTextField(document.createElement("textarea"))).toBe(true);
        expect(isTextField(document.createElement("div"))).toBe(false);
        expect(isTextField(null)).toBe(false);
    });
});
