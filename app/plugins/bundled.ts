import { reviewPlugin } from "./review";
import type { BundledPlugin } from "./types";

// only statically imported, reviewed modules can join the host.
export let bundledPlugins: readonly BundledPlugin[] = [reviewPlugin];
