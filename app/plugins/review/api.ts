import type { PluginAPI } from "../types";
import type { AnnotationList } from "../../messages/AnnotationList";
import type { AnnotationStatus } from "../../messages/AnnotationStatus";
import type { TargetInput } from "../../messages/TargetInput";
import type { RevId } from "../../messages/RevId";

// narrowed to the host capabilities this plugin uses.
export interface ReviewAPI extends PluginAPI {
    navigation: { select(id: RevId, path?: string): Promise<void> };
    notes: {
        list(context: string): Promise<AnnotationList>;
        create(context: string, targets: TargetInput[], body: string): Promise<AnnotationList>;
        reply(context: string, id: string, body: string): Promise<AnnotationList>;
        edit(context: string, id: string, post: string, body: string): Promise<AnnotationList>;
        setStatus(context: string, id: string, status: AnnotationStatus): Promise<AnnotationList>;
    };
}
