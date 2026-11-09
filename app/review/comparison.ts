import type { RevId } from "../messages/RevId";

export interface ReviewComparison {
    from: RevId;
    to: RevId;
    path: string | null;
}

export type CompareReview = (from: RevId, to: RevId, path: string | null) => void;
