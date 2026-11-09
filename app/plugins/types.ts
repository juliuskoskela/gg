import type { Component } from "svelte";
import type { Readable } from "svelte/store";
import type { Query } from "../events";
import type { Operand } from "../messages/Operand";
import type { AnnotationList } from "../messages/AnnotationList";
import type { PluginFact } from "../messages/PluginFact";
import type { ReviewProgress } from "../messages/ReviewProgress";
import type { RevSet } from "../messages/RevSet";
import type { RepoStatus } from "../messages/RepoStatus";

export type Capability = "queries.read" | "annotations.read" | "reviews.read" | "storage" | "facts.publish";
export interface PluginManifest {
    id: string;
    name: string;
    version: string;
    description: string;
    apiVersion: 1;
    capabilities: Capability[];
}
export type ReadCommand = "query_revisions" | "query_revision_summary" | "query_revision_diff" | "query_review_delta" | "query_evolution" | "query_operation_history" | "query_operation_detail" | "query_remotes";
export type PluginContext = { repository: string; workspace: string; status: RepoStatus | undefined; selection?: RevSet | null };
export interface PluginAPI {
    readonly context: Readable<PluginContext>;
    query<T>(command: ReadCommand, args: Record<string, unknown>): Promise<Query<T>>;
    annotations(): Promise<AnnotationList>;
    reviews(): Promise<ReviewProgress>;
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
