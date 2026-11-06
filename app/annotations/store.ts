import { derived, get, writable } from "svelte/store";
import { annotate, getInput } from "../ipc";
import { dock } from "../workspace/dock";
import type { AnnotationList } from "../messages/AnnotationList";
import type { AnnotationRequest } from "../messages/AnnotationRequest";
import type { AnnotationThread } from "../messages/AnnotationThread";
import type { AnchorDraft } from "./anchors";
import type { Command } from "../commands/registry";

export let annotationList = writable<AnnotationList | null>(null);
export let annotationError = writable("");
/** the note open in the Annotations view: a note id, the draft, or nothing */
export let openAnnotation = writable<string | null>(null);
export const DRAFT = "draft";

export type Draft = AnchorDraft & { body: string; startedAt: string };
const DRAFT_KEY = "gg.annotations.draft";

// a draft is work in progress: it survives switching views and reloading, until saved or discarded
function restoreDraft(): Draft | null {
    try {
        let raw = typeof localStorage === "undefined" ? null : localStorage.getItem(DRAFT_KEY);
        let value = raw ? JSON.parse(raw) : null;
        return value && typeof value.body === "string" && value.anchor?.change_id ? value : null;
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

export let annotations = derived(annotationList, list => list?.threads ?? []);
/** open notes per change, for markers in the timeline and file tree */
export let openNotesByChange = derived(annotations, threads => {
    let counts = new Map<string, AnnotationThread[]>();
    for (let thread of threads) {
        if (thread.status !== "open") continue;
        let key = thread.anchor.change_id;
        counts.set(key, [...(counts.get(key) ?? []), thread]);
    }
    return counts;
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

export async function saveDraft(): Promise<boolean> {
    let current = get(draft);
    if (!current?.body.trim()) return false;
    let before = new Set(get(annotations).map(thread => thread.id));
    let saved = await sendAnnotations({ type: "Create", anchor: current.anchor, subject: current.subject, body: current.body });
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

function sameAnchor(a: AnchorDraft, b: AnchorDraft) {
    return JSON.stringify(a.anchor) === JSON.stringify(b.anchor);
}

/** starts a note in the Annotations view, keeping the rest of the app usable while writing */
export async function startDraft(next: AnchorDraft) {
    let current = get(draft);
    if (current && current.body.trim() && !sameAnchor(current, next)) {
        let answer = await getInput("Replace your unsaved note?", "You have an unsaved note. Starting a new one discards it.", [{ label: "Note", choices: ["Keep editing", "Discard and start new"] }]);
        if (answer?.Note !== "Discard and start new") {
            showDraft();
            return;
        }
    }
    if (!current || !sameAnchor(current, next) || !current.body.trim()) draft.set({ ...next, body: current && sameAnchor(current, next) ? current.body : "", startedAt: new Date().toISOString() });
    showDraft();
}

export function showDraft() {
    openAnnotation.set(DRAFT);
    dock.open("annotations");
    draftFocus.update(value => value + 1);
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
