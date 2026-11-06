import { derived, get, writable } from "svelte/store";
import { annotate } from "../ipc";
import type { AnnotationList } from "../messages/AnnotationList";
import type { AnnotationRequest } from "../messages/AnnotationRequest";
import type { AnnotationThread } from "../messages/AnnotationThread";
import type { AnchorDraft } from "./anchors";
import type { Command } from "../commands/registry";

export let annotationList = writable<AnnotationList | null>(null);
export let annotationError = writable("");
/** the note open in the Annotations view */
export let openAnnotation = writable<string | null>(null);
/** the note being written; null when the composer is closed */
export let composer = writable<AnchorDraft | null>(null);

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

export async function createAnnotation(draft: AnchorDraft, body: string): Promise<boolean> {
    let before = new Set(get(annotations).map(thread => thread.id));
    let saved = await sendAnnotations({ type: "Create", anchor: draft.anchor, subject: draft.subject, body });
    if (saved) {
        let created = get(annotations).find(thread => !before.has(thread.id));
        if (created) openAnnotation.set(created.id);
    }
    return saved;
}

export function openComposer(draft: AnchorDraft) {
    composer.set(draft);
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
