import { get, writable } from "svelte/store";
import { isTauri } from "../../ipc";
import { MAX_BYTES, mergeReview, now, parseReview, uid, type Anchor, type Person, type Review, type Status } from "./model";

export let reviewPlugin = { id: "gg.review", name: "Review", version: "0.1.0", documentVersion: 1 };
let STORAGE = "gg.plugins.review.v1";
export let storageWarning = writable("");
let initial: Review[] = [];
let person: Person = { id: uid(), name: "" };
let enabled = true;
try {
    let raw = localStorage.getItem(STORAGE);
    if (raw) { let data = JSON.parse(raw); if (!Array.isArray(data)) throw new Error("Invalid review library"); initial = data.map(item => parseReview(JSON.stringify(item))); }
    let saved = JSON.parse(localStorage.getItem(`${STORAGE}.person`) ?? "null");
    if (saved && typeof saved.id === "string" && typeof saved.name === "string") person = saved;
    enabled = localStorage.getItem(`${STORAGE}.enabled`) !== "false";
} catch { storageWarning.set("Saved reviews could not be loaded. Their stored copy is preserved. Import a JSON backup to recover."); }
export let reviews = writable<Review[]>(initial);
export let reviewer = writable<Person>(person);
export let reviewEnabled = writable(enabled);
export let activeReview = writable(initial[0]?.id ?? "");
let recovered = !get(storageWarning);
function mergeLibrary(incoming: Review[], local: Review[]) {
    let merged = new Map(local.map(item => [item.id, item]));
    for (let item of incoming) { let current = merged.get(item.id); merged.set(item.id, current ? mergeReview(current, item) : item); }
    return [...merged.values()];
}
window.addEventListener("storage", event => {
    if (event.key !== STORAGE || !event.newValue) return;
    try {
        let data = JSON.parse(event.newValue);
        if (!Array.isArray(data)) throw new Error("Invalid review library");
        reviews.set(mergeLibrary(data.map(item => parseReview(JSON.stringify(item))), get(reviews)));
    } catch { storageWarning.set("Another window has a conflicting review library. Your current reviews are preserved; export a backup before closing."); }
});
function persist() {
    if (!recovered) return;
    try {
        let raw = localStorage.getItem(STORAGE);
        if (raw) { let disk = JSON.parse(raw); if (!Array.isArray(disk)) throw new Error("Invalid review library"); reviews.set(mergeLibrary(disk.map(item => parseReview(JSON.stringify(item))), get(reviews))); }
        localStorage.setItem(STORAGE, JSON.stringify(get(reviews))); storageWarning.set("");
    }
    catch { storageWarning.set("Reviews are in memory only: local storage is full or unavailable. Export JSON before closing this window."); }
}
export function setReviewer(name: string) {
    let profile = { ...get(reviewer), name: name.trim().slice(0, 120) };
    reviewer.set(profile);
    try { localStorage.setItem(`${STORAGE}.person`, JSON.stringify(profile)); } catch { storageWarning.set("Your name could not be saved. Export your review before closing this window."); }
}
export function setReviewEnabled(value: boolean) { reviewEnabled.set(value); try { localStorage.setItem(`${STORAGE}.enabled`, String(value)); } catch { /* usable for this session */ } }
export function putReview(review: Review) {
    let valid = parseReview(JSON.stringify(review));
    let existing = get(reviews).find(item => item.id === valid.id);
    if (existing) valid = mergeReview(existing, valid);
    reviews.update(items => [valid, ...items.filter(item => item.id !== valid.id)]);
    activeReview.set(valid.id); persist(); return valid;
}
export function importReview(json: string) { return putReview(parseReview(json)); }
function update(id: string, change: (review: Review, author: Person) => Review) {
    let review = get(reviews).find(item => item.id === id);
    let author = get(reviewer);
    if (!review) throw new Error("Review is no longer available.");
    if (!author.name.trim()) throw new Error("Enter your name before joining the discussion.");
    return putReview(change(review, { ...author }));
}
function eventTime(review: Review) {
    // preserve causal order even when events arrive from a clock ahead of this device.
    let times = [review.createdAt, ...review.seen.map(e => e.at), ...review.threads.flatMap(t => [...t.posts, ...t.events].map(e => e.at))];
    return new Date(Math.max(Date.now(), times.reduce((last, at) => Math.max(last, Date.parse(at) + 1), 0))).toISOString();
}
export function addThread(id: string, anchor: Anchor, body: string) {
    return update(id, (review, author) => ({ ...review, threads: [...review.threads, { id: uid(), anchor, posts: [{ id: uid(), author, at: eventTime(review), body: body.trim() }], events: [] }] }));
}
export function reply(id: string, thread: string, body: string) {
    return update(id, (review, author) => ({ ...review, threads: review.threads.map(item => item.id === thread ? { ...item, posts: [...item.posts, { id: uid(), author, at: eventTime(review), body: body.trim() }] } : item) }));
}
export function setStatus(id: string, thread: string, status: Status) {
    return update(id, (review, author) => ({ ...review, threads: review.threads.map(item => item.id === thread ? { ...item, events: [...item.events, { id: uid(), author, at: eventTime(review), status }] } : item) }));
}
export function setSeen(id: string, file: string, seen: boolean) { return update(id, (review, author) => ({ ...review, seen: [...review.seen, { id: uid(), author, at: eventTime(review), file, seen }] })); }
export async function exportReview(review: Review) {
    let completed = { ...review, completedAt: now() };
    let validated = parseReview(JSON.stringify(completed));
    let json = JSON.stringify(validated, null, 2);
    if (new TextEncoder().encode(json).length > MAX_BYTES) json = JSON.stringify(validated);
    let filename = `${review.title.replace(/[^a-z0-9-]+/gi, "-").slice(0, 60) || "review"}.gg-review.json`;
    if (isTauri()) {
        let { invoke } = await import("@tauri-apps/api/core");
        let saved = await invoke<boolean>("export_review", { json, filename });
        if (!saved) return false;
    } else {
        let url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
        let link = document.createElement("a"); link.href = url; link.download = filename; link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    putReview(completed); return true;
}
