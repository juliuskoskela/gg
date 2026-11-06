import { derived, get, writable } from "svelte/store";
import { annotate, getInput } from "../ipc";
import { dock } from "../workspace/dock";
import type { AnnotationAnchor } from "../messages/AnnotationAnchor";
import type { AnnotationList } from "../messages/AnnotationList";
import type { AnnotationRequest } from "../messages/AnnotationRequest";
import type { AnnotationThread } from "../messages/AnnotationThread";
import type { TargetInput } from "../messages/TargetInput";
import type { Command } from "../commands/registry";
import { mergeTargets, sameAnchor } from "./anchors";

export let annotationList = writable<AnnotationList | null>(null);
export let annotationError = writable("");
/** the note open in the Annotations view: a note id, the draft, or nothing */
export let openAnnotation = writable<string | null>(null);
export const DRAFT = "draft";

export type Draft = { targets: TargetInput[]; body: string; startedAt: string };
const DRAFT_KEY = "gg.annotations.draft";

// a draft is work in progress: it survives switching views and reloading, until saved or discarded
function restoreDraft(): Draft | null {
    try {
        let raw = typeof localStorage === "undefined" ? null : localStorage.getItem(DRAFT_KEY);
        let value = raw ? JSON.parse(raw) : null;
        if (!value || typeof value.body !== "string") return null;
        // drafts from before notes could point at several places
        if (!Array.isArray(value.targets) && value.anchor?.change_id) value.targets = [{ anchor: value.anchor, subject: value.subject ?? "" }];
        return Array.isArray(value.targets) && value.targets.length ? { targets: value.targets, body: value.body, startedAt: value.startedAt ?? new Date().toISOString() } : null;
    } catch {
        return null;
    }
}
export let draft = writable<Draft | null>(restoreDraft());
draft.subscribe(value => {
    try {
        if (typeof localStorage === "undefined") return;
        if (value) localStorage.setItem(DRAFT_KEY, JSON.stringify(value)); else localStorage.removeItem(DRAFT_KEY);
    } catch { /* the draft stays in memory */ }
});
/** increments when the editor should take focus */
export let draftFocus = writable(0);
/** targets added a moment ago, so the view can show where they went */
export let justAdded = writable<{ note: string; anchors: AnnotationAnchor[] } | null>(null);

export let annotations = derived(annotationList, list => list?.threads ?? []);
/** open notes per change, for markers in the timeline and file tree */
export let openNotesByChange = derived(annotations, threads => {
    let byChange = new Map<string, AnnotationThread[]>();
    for (let thread of threads) {
        if (thread.status !== "open") continue;
        for (let key of new Set(thread.targets.map(target => target.anchor.change_id))) byChange.set(key, [...(byChange.get(key) ?? []), thread]);
    }
    return byChange;
});

let latest = 0;
export async function sendAnnotations(request: AnnotationRequest): Promise<boolean> {
    let ticket = ++latest;
    let result = await annotate<AnnotationList>("annotations", { request });
    // a slow poll mustn't overwrite the answer to a newer change
    if (ticket !== latest && request.type === "List") return result.type === "data";
    if (result.type === "error") {
        annotationError.set(result.message);
        return false;
    }
    annotationError.set("");
    annotationList.set(result.value);
    return true;
}

export function loadAnnotations() {
    return sendAnnotations({ type: "List" });
}

// a plain-text line: markdown syntax would be noise in lists and menus
export function plainLine(body: string) {
    let line = body.split("\n").find(text => text.trim()) ?? "";
    return line.replace(/^\s*(#+|[-*+]|\d+\.|>)\s+/, "").replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/(\*\*|__|\*|_|`)(.+?)\1/g, "$2").trim();
}

export function noteTitle(thread: AnnotationThread | null | undefined): string {
    return plainLine(thread?.posts[0]?.body ?? "");
}

export async function saveDraft(): Promise<boolean> {
    let current = get(draft);
    if (!current?.body.trim()) return false;
    let before = new Set(get(annotations).map(thread => thread.id));
    let saved = await sendAnnotations({ type: "Create", targets: current.targets, body: current.body });
    if (saved) {
        draft.set(null);
        openAnnotation.set(get(annotations).find(thread => !before.has(thread.id))?.id ?? null);
    }
    return saved;
}

export function discardDraft() {
    draft.set(null);
    if (get(openAnnotation) === DRAFT) openAnnotation.set(null);
}

function sameTargets(a: TargetInput[], b: TargetInput[]) {
    return a.length === b.length && a.every((target, index) => sameAnchor(target.anchor, b[index].anchor));
}

/** starts a note in the Annotations view, keeping the rest of the app usable while writing */
export async function startDraft(targets: TargetInput[]) {
    if (!targets.length) return;
    let current = get(draft);
    if (current && current.body.trim() && !sameTargets(current.targets, targets)) {
        let answer = await getInput("Replace your unsaved note?", "You have an unsaved note. Starting a new one discards it. To point the unsaved note here as well, choose Add to draft instead.", [{ label: "Note", choices: ["Keep editing", "Discard and start new"] }]);
        if (answer?.Note !== "Discard and start new") {
            showDraft();
            return;
        }
    }
    if (!current || !current.body.trim() || !sameTargets(current.targets, targets)) draft.set({ targets, body: "", startedAt: new Date().toISOString() });
    showDraft();
}

export function showDraft() {
    openAnnotation.set(DRAFT);
    dock.open("annotations");
    draftFocus.update(value => value + 1);
}

/** where Add to sends targets: the note open in the Annotations view, otherwise the draft */
export function addDestination(): { label: string; add: (targets: TargetInput[]) => Promise<void> } | null {
    let open = get(openAnnotation);
    let note = open && open !== DRAFT ? get(annotations).find(thread => thread.id === open) : null;
    if (note) {
        let title = noteTitle(note);
        let id = note.id;
        return { label: `Add to “${title.length > 28 ? `${title.slice(0, 27)}…` : title}”`, add: targets => addToNote(id, targets) };
    }
    if (get(draft)) return { label: "Add to draft", add: async targets => addToDraft(targets) };
    return null;
}

function addToDraft(targets: TargetInput[]) {
    draft.update(value => value ? { ...value, targets: mergeTargets(value.targets, targets) } : value);
    justAdded.set({ note: DRAFT, anchors: targets.map(target => target.anchor) });
    openAnnotation.set(DRAFT);
    dock.open("annotations");
}

async function addToNote(id: string, targets: TargetInput[]) {
    if (await sendAnnotations({ type: "AddTargets", id, targets })) {
        justAdded.set({ note: id, anchors: targets.map(target => target.anchor) });
        openAnnotation.set(id);
        dock.open("annotations");
    }
}

export async function removeTarget(note: string, anchor: AnnotationAnchor) {
    if (note === DRAFT) {
        draft.update(value => value && value.targets.length > 1 ? { ...value, targets: value.targets.filter(target => !sameAnchor(target.anchor, anchor)) } : value);
        return;
    }
    await sendAnnotations({ type: "RemoveTarget", id: note, anchor });
}

export async function exportAnnotations(ids: string[]): Promise<string | null> {
    let result = await annotate<string>("export_annotations", { ids });
    if (result.type === "error") {
        annotationError.set(result.message);
        return null;
    }
    return result.value;
}

export async function copyText(text: string): Promise<boolean> {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        // webviews without clipboard permission still allow a user-initiated copy command
        let area = document.createElement("textarea");
        area.value = text;
        area.setAttribute("readonly", "");
        area.style.position = "fixed";
        area.style.opacity = "0";
        document.body.append(area);
        area.select();
        let copied = document.execCommand("copy");
        area.remove();
        return copied;
    }
}

export async function copyAnnotations(ids: string[]): Promise<boolean> {
    let markdown = await exportAnnotations(ids);
    return markdown !== null && await copyText(markdown);
}

/** a menu for things that aren't operands, such as lines in a diff */
export let lineMenu = writable<{ x: number; y: number; heading: string | null; commands: Command[] } | null>(null);
