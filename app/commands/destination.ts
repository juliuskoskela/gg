import { writable } from "svelte/store";
import type { RevHeader } from "../messages/RevHeader";
export type DestinationRequest = { title: string; candidates: RevHeader[]; resolve: (value: string | null) => void };
export let destinationRequest = writable<DestinationRequest | null>(null);
export function chooseDestination(title: string, candidates: RevHeader[]): Promise<string | null> {
    return new Promise(resolve => destinationRequest.set({ title, candidates, resolve }));
}
