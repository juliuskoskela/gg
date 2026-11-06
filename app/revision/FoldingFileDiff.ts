import { FileDiff } from "@pierre/diffs";

// Pierre exposes expansion publicly, but collapse still needs its protected renderer.
export class FoldingFileDiff<LAnnotation = number> extends FileDiff<LAnnotation> {
    get diff() { return this.getWorkingDiff(); }

    collapse(gap: number) {
        let regions = new Map(this.hunksRenderer.getExpandedHunksMap());
        regions.delete(gap);
        this.hunksRenderer.setExpandedHunksMap(regions);
        this.hunksRenderer.clearRenderCache();
    }
}
