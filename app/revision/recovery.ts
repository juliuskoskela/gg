import { writable } from "svelte/store";
import type { RevHeader } from "../messages/RevHeader";
import type { RevSet } from "../messages/RevSet";

export let selectionRecovery = writable<{ message: string; candidates: RevHeader[]; set: RevSet; endpoint: "from" | "to" } | null>(null);
