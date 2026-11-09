import { derived, get, writable } from "svelte/store";
import { annotate } from "../ipc";
import { repoConfigEvent } from "../stores";
import { repositoryScope } from "../workspace/repository";
import type { ReviewProgress } from "../messages/ReviewProgress";
import type { ReviewRequest } from "../messages/ReviewRequest";
import type { RevHeader } from "../messages/RevHeader";

export let reviewProgress = writable<ReviewProgress | null>(null);
export let reviewError = writable("");
export let reviewBusy = writable(false);
export let reviewsByChange = derived(reviewProgress, value => new Map(value?.changes.map(change => [change.change_id, change]) ?? []));
let scope = "";
let generation = 0;

export function resetReviewProgress(nextScope: string) {
    if (scope === nextScope) return;
    scope = nextScope;
    generation++;
    reviewProgress.set(null);
    reviewError.set("");
    reviewBusy.set(false);
}

export async function refreshReviewProgress(request: ReviewRequest = { type: "List" }) {
    let currentScope = repositoryScope(get(repoConfigEvent));
    resetReviewProgress(currentScope);
    if (!currentScope) return false;
    if (request.type === "List" && get(reviewBusy)) return false;
    let ticket = ++generation;
    if (request.type === "Set") reviewBusy.set(true);
    let result = await annotate<ReviewProgress>("review_progress", { request });
    if (ticket !== generation || currentScope !== repositoryScope(get(repoConfigEvent))) return false;
    reviewBusy.set(false);
    if (result.type === "error") { reviewError.set(result.message); return false; }
    reviewError.set("");
    reviewProgress.set(result.value);
    return true;
}

export function setReviewed(header: RevHeader, path: string | null, reviewed: boolean) {
    return refreshReviewProgress({ type: "Set", id: header.id, path, reviewed });
}

export function fileReviewState(header: RevHeader, path: string, progress: ReviewProgress | null) {
    let change = progress?.changes.find(change => change.change_id === header.id.change.hex);
    let file = change?.files.find(file => file.path === path);
    if (!file) return null;
    if (file.reviewed_commit_id === header.id.commit.hex) return "reviewed";
    return change?.commit_id === header.id.commit.hex ? file.state : null;
}
