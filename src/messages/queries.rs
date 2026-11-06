//! Request/response types for read-only operations like log listing and
//! revision details.

use super::*;

/// A file-level change within a revision's diff.
#[derive(Serialize, Deserialize, Debug)]
#[cfg_attr(feature = "ts-rs", derive(TS), ts(export, export_to = "app/messages/"))]
pub struct RevChange {
    pub kind: ChangeKind,
    pub path: TreePath,
    pub has_conflict: bool,
    pub hunks: Vec<ChangeHunk>,
    /// carried over from the summary; full diffs derive counts from hunks instead
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts-rs", ts(optional))]
    pub stat: Option<LineStat>,
}

/// Added and removed line counts for one file.
#[derive(Serialize, Deserialize, Debug, Clone, Copy)]
#[cfg_attr(feature = "ts-rs", derive(TS), ts(export, export_to = "app/messages/"))]
pub struct LineStat {
    pub added: u32,
    pub removed: u32,
}

/// Metadata available without materializing file contents.
#[derive(Serialize, Debug)]
#[cfg_attr(feature = "ts-rs", derive(TS), ts(export, export_to = "app/messages/"))]
pub struct RevChangeSummary {
    pub kind: ChangeKind,
    pub path: TreePath,
    pub has_conflict: bool,
    /// absent for binary files and for revisions too large to stat cheaply
    pub stat: Option<LineStat>,
}

#[derive(Serialize, Debug)]
#[serde(tag = "type")]
#[cfg_attr(feature = "ts-rs", derive(TS), ts(export, export_to = "app/messages/"))]
pub enum RevisionSummaryResult {
    NotFound {
        set: RevSet,
    },
    Detail {
        set: RevSet,
        headers: Vec<RevHeader>,
        parents: Vec<RevHeader>,
        changes: Vec<RevChangeSummary>,
        conflicts: Vec<TreePath>,
    },
}

#[derive(Serialize, Debug)]
#[serde(tag = "type")]
#[cfg_attr(feature = "ts-rs", derive(TS), ts(export, export_to = "app/messages/"))]
#[allow(clippy::large_enum_variant)]
pub enum RevisionDiffResult {
    NotFound {
        set: RevSet,
    },
    Detail {
        set: RevSet,
        path: TreePath,
        change: Option<RevChange>,
        conflict: Option<RevConflict>,
    },
}

/// Exact commit and currently visible commits for the same logical change.
#[derive(Serialize, Debug)]
#[cfg_attr(feature = "ts-rs", derive(TS), ts(export, export_to = "app/messages/"))]
pub struct RevisionSelectionResult {
    pub exact: Option<RevHeader>,
    pub candidates: Vec<RevHeader>,
}

/// Current operation state before the mutation takes its working-copy snapshot.
#[derive(Serialize, Debug)]
#[cfg_attr(feature = "ts-rs", derive(TS), ts(export, export_to = "app/messages/"))]
pub struct OperationPreflight {
    pub eligible: bool,
    pub description: Option<String>,
    pub reason: Option<String>,
}

/// A file-level conflict in a revision's parent tree.
#[derive(Serialize, Deserialize, Debug)]
#[cfg_attr(feature = "ts-rs", derive(TS), ts(export, export_to = "app/messages/"))]
pub struct RevConflict {
    pub path: TreePath,
    pub hunk: ChangeHunk,
}

/// The type of modification made to a file in a diff.
#[derive(Serialize, Deserialize, Debug)]
#[cfg_attr(feature = "ts-rs", derive(TS), ts(export, export_to = "app/messages/"))]
pub enum ChangeKind {
    None,
    Added,
    Deleted,
    Modified,
}

/// Response to a revision detail query: either not found or full details.
#[derive(Serialize, Debug)]
#[serde(tag = "type")]
#[cfg_attr(feature = "ts-rs", derive(TS), ts(export, export_to = "app/messages/"))]
#[allow(clippy::large_enum_variant)]
pub enum RevsResult {
    NotFound {
        set: RevSet,
    },
    Detail {
        /// The revision set that was queried.
        set: RevSet,
        /// All revisions in the set, ordered ancestors-first.
        headers: Vec<RevHeader>,
        /// Parents of the oldest revision in the set.
        parents: Vec<RevHeader>,
        /// Combined changes: diff from oldest parent to newest revision.
        changes: Vec<RevChange>,
        /// Conflicts present in the parent tree of the oldest revision.
        conflicts: Vec<RevConflict>,
    },
}

/// (column, row) position of a node in the log graph.
#[derive(Serialize, Clone, Copy, Debug)]
#[cfg_attr(feature = "ts-rs", derive(TS), ts(export, export_to = "app/messages/"))]
pub struct LogCoordinates(pub usize, pub usize);

/// An edge segment in the log graph connecting two nodes.
#[derive(Serialize, Debug)]
#[serde(tag = "type")]
#[cfg_attr(feature = "ts-rs", derive(TS), ts(export, export_to = "app/messages/"))]
pub enum LogLine {
    FromNode {
        source: LogCoordinates,
        target: LogCoordinates,
        indirect: bool,
    },
    ToNode {
        source: LogCoordinates,
        target: LogCoordinates,
        indirect: bool,
    },
    ToIntersection {
        source: LogCoordinates,
        target: LogCoordinates,
        indirect: bool,
    },
    ToMissing {
        source: LogCoordinates,
        target: LogCoordinates,
        indirect: bool,
    },
}

/// A single row in the log graph with its revision and edges.
#[derive(Serialize, Debug)]
#[cfg_attr(feature = "ts-rs", derive(TS), ts(export, export_to = "app/messages/"))]
pub struct LogRow {
    pub revision: RevHeader,
    pub location: LogCoordinates,
    pub padding: usize,
    pub lines: Vec<LogLine>,
}

/// A paginated slice of the log graph.
#[derive(Serialize)]
#[cfg_attr(feature = "ts-rs", derive(TS), ts(export, export_to = "app/messages/"))]
pub struct LogPage {
    pub rows: Vec<LogRow>,
    pub has_more: bool,
}

/// One working copy that shares the loaded repository.
#[derive(Serialize, Debug, Clone)]
#[cfg_attr(feature = "ts-rs", derive(TS), ts(export, export_to = "app/messages/"))]
pub struct WorkspaceRecord {
    pub name: String,
    /// absent when this jj version has no recorded path for the workspace
    #[serde(skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts-rs", ts(optional))]
    pub path: Option<DisplayPath>,
}

/// The repository (project) and the working copy (workspace) currently open.
#[derive(Serialize, Debug, Clone)]
#[cfg_attr(feature = "ts-rs", derive(TS), ts(export, export_to = "app/messages/"))]
pub struct WorkspaceContext {
    pub project_name: String,
    pub repo_path: DisplayPath,
    pub workspace_name: String,
    pub workspace_path: DisplayPath,
    pub workspaces: Vec<WorkspaceRecord>,
}

/// A stored commit without flags derived from today's repository view.
#[derive(Serialize, Debug)]
#[cfg_attr(feature = "ts-rs", derive(TS), ts(export, export_to = "app/messages/"))]
pub struct HistoryRevision {
    pub id: RevId,
    pub description: MultilineString,
    pub author: RevAuthor,
    pub parent_ids: Vec<String>,
    pub has_conflict: bool,
}

#[derive(Serialize, Debug)]
#[cfg_attr(feature = "ts-rs", derive(TS), ts(export, export_to = "app/messages/"))]
pub struct OperationRecord {
    pub id: String,
    pub parent_ids: Vec<String>,
    pub description: String,
    pub started_at: String,
    pub finished_at: String,
    pub username: String,
    pub hostname: String,
    pub workspace: Option<String>,
    pub is_snapshot: bool,
}

#[derive(Serialize, Debug)]
#[cfg_attr(feature = "ts-rs", derive(TS), ts(export, export_to = "app/messages/"))]
pub struct EvolutionEntry {
    pub revision: HistoryRevision,
    pub predecessor_ids: Vec<String>,
    pub operation: Option<OperationRecord>,
}

#[derive(Serialize, Debug)]
#[cfg_attr(feature = "ts-rs", derive(TS), ts(export, export_to = "app/messages/"))]
pub struct EvolutionPage {
    pub entries: Vec<EvolutionEntry>,
    pub has_more: bool,
}

#[derive(Serialize, Debug)]
#[cfg_attr(feature = "ts-rs", derive(TS), ts(export, export_to = "app/messages/"))]
pub struct OperationPage {
    /// fixed anchor for subsequent pages, even when new operations arrive
    pub head_id: String,
    pub entries: Vec<OperationRecord>,
    pub has_more: bool,
}

#[derive(Serialize, Debug)]
#[cfg_attr(feature = "ts-rs", derive(TS), ts(export, export_to = "app/messages/"))]
pub struct HistoricalBookmark {
    pub name: String,
    pub added_ids: Vec<String>,
    pub removed_ids: Vec<String>,
    pub has_conflict: bool,
}

#[derive(Serialize, Debug)]
#[cfg_attr(feature = "ts-rs", derive(TS), ts(export, export_to = "app/messages/"))]
pub struct HistoricalWorkspace {
    pub name: String,
    pub commit_id: String,
}

/// A read-only repository view loaded from an exact operation.
#[derive(Serialize, Debug)]
#[cfg_attr(feature = "ts-rs", derive(TS), ts(export, export_to = "app/messages/"))]
pub struct OperationDetail {
    pub operation: OperationRecord,
    pub parents: Vec<OperationRecord>,
    pub revisions: Vec<HistoryRevision>,
    pub has_more_revisions: bool,
    pub heads: Vec<String>,
    pub bookmarks: Vec<HistoricalBookmark>,
    pub workspaces: Vec<HistoricalWorkspace>,
}
