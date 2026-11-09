import type { Component } from "svelte";
import type { Readable } from "svelte/store";
import type { Query } from "../events";
import type { Operand } from "../messages/Operand";
import type { AnnotationBundle } from "../messages/AnnotationBundle";
import type { AnnotationStatus } from "../messages/AnnotationStatus";
import type { TargetInput } from "../messages/TargetInput";
import type { RevId } from "../messages/RevId";
import type { AnnotationList } from "../messages/AnnotationList";
import type { PluginFact } from "../messages/PluginFact";
import type { ReviewProgress } from "../messages/ReviewProgress";
import type { RevSet } from "../messages/RevSet";
import type { RepoStatus } from "../messages/RepoStatus";
import type { SplitOutcome } from "../messages/SplitOutcome";

export type Capability = "queries.read" | "navigation" | "annotations.write" | "annotations.exchange" | "annotations.read" | "reviews.read" | "storage" | "facts.publish";
export interface PluginManifest {
    id: string;
    name: string;
    version: string;
    description: string;
    apiVersion: 1;
    capabilities: Capability[];
}
export type ReadCommand = "query_revisions" | "query_revision_summary" | "query_revision_diff" | "query_review_delta" | "query_evolution" | "query_operation_history" | "query_operation_detail" | "query_remotes" | "resolve_revision_selection" | "query_split_receipts" | "query_split_receipt_states";
export type PluginContext = { repository: string; workspace: string; status: RepoStatus | undefined; selection?: RevSet | null };
export interface PluginAPI {
    readonly context: Readable<PluginContext>;
    query<T>(command: ReadCommand, args: Record<string, unknown>): Promise<Query<T>>;
    annotations(): Promise<AnnotationList>;
    reviews(): Promise<ReviewProgress>;
    readonly navigation: { split(id: RevId): Promise<SplitOutcome | null>; select(id: RevId, path?: string): Promise<void>; openView(view: string): Promise<void> };
    readonly notes: {
        list(context: string): Promise<AnnotationList>;
        create(context: string, targets: TargetInput[], body: string): Promise<AnnotationList>;
        reply(context: string, id: string, body: string): Promise<AnnotationList>;
        edit(context: string, id: string, post: string, body: string): Promise<AnnotationList>;
        setStatus(context: string, id: string, status: AnnotationStatus): Promise<AnnotationList>;
        export(context: string): Promise<AnnotationBundle>;
        import(context: string, bundle: AnnotationBundle): Promise<AnnotationList>;
    };
    readonly storage: {
        get(key: string): Promise<unknown>;
        set(key: string, value: unknown): Promise<void>;
        delete(key: string): Promise<void>;
        keys(): Promise<string[]>;
    };
    publish(kind: string, data: unknown): Promise<PluginFact>;
}
export type PluginViewProps = { api: PluginAPI };
export interface PluginCommand {
    id: string;
    label: string;
    icon?: string;
    available?: (operand: Operand | null) => boolean;
    execute: (operand: Operand | null) => void | Promise<void>;
    contextMenu?: boolean;
}
export interface PluginActivation {
    views?: { id: string; label: string; component: Component<PluginViewProps> }[];
    commands?: PluginCommand[];
    dispose?: () => void;
}
export interface BundledPlugin {
    manifest: PluginManifest;
    activate: (api: PluginAPI) => PluginActivation | Promise<PluginActivation>;
}
