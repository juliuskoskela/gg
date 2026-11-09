import { tick } from "svelte";
import { selectRevision } from "./navigation";
import { loadAnnotations } from "../annotations/store";
import type { PluginNotesResponse } from "../messages/PluginNotesResponse";
import { annotate, query } from "../ipc";
import type { ReviewProgress } from "../messages/ReviewProgress";
import type { PluginData } from "../messages/PluginData";
import type { AnnotationList } from "../messages/AnnotationList";
import { dock } from "../workspace/dock";
import { bundledPlugins } from "./bundled";
import { createPluginHost } from "./host";

async function localData<T>(command: string, args: Record<string, unknown>): Promise<T> {
    let result = await annotate<T>(command, args);
    if (result.type === "error") throw new Error(result.message);
    return result.value;
}

export let pluginHost = createPluginHost(bundledPlugins, {
    query,
    annotations: () => localData<AnnotationList>("annotations", { request: { type: "List" } }),
    reviews: () => localData<ReviewProgress>("review_progress", { request: { type: "List" } }),
    data: (plugin, operation, workspace) => localData<PluginData>("plugin_data", { request: { plugin, operation, workspace } }),
    navigate: selectRevision,
    notes: async (plugin, context, workspace, action) => {
        let result = await localData<PluginNotesResponse>("plugin_notes", { request: { plugin, context, workspace, action } });
        if (action.type !== "List" && action.type !== "Export") await loadAnnotations();
        return result;
    },
    openView: async id => {
        dock.open(id);
        await tick();
        document.getElementById(`panel-tab-${id}`)?.focus();
    },
    closeView: id => dock.close(id),
    loadEnabled: () => {
        try {
            let value = JSON.parse(localStorage.getItem("gg.plugins.enabled") ?? "[]");
            return Array.isArray(value) ? value.filter(item => typeof item === "string") : [];
        } catch { return []; }
    },
    saveEnabled: ids => { try { localStorage.setItem("gg.plugins.enabled", JSON.stringify(ids)); } catch { /* retain in-memory preference */ } },
});
