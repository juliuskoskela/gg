use std::{borrow::Borrow, collections::HashSet, io::Write, mem, ops::Range, pin::Pin};

use anyhow::{Result, anyhow};
use futures_util::{AsyncReadExt, Stream, StreamExt, try_join};
use itertools::Itertools;
use jj_cli::diff_util::LineDiffOptions;
use jj_lib::{
    backend::{BackendError, CommitId, MergedTreeValueExt as _},
    conflict_labels::ConflictLabels,
    conflicts::{
        self, ConflictMarkerStyle, ConflictMaterializeOptions, MaterializedFileValue,
        MaterializedTreeValue,
    },
    diff::{
        CompareBytesExactly, CompareBytesIgnoreAllWhitespace, CompareBytesIgnoreWhitespaceAmount,
        ContentDiff, DiffHunk, DiffHunkKind, find_line_ranges,
    },
    diff_presentation::LineCompareMode,
    files::FileMergeHunkLevel,
    graph::{GraphEdgeType, GraphNode, TopoGroupedGraph},
    matchers::{EverythingMatcher, FilesMatcher},
    merge::{Diff, SameChange},
    merged_tree::{TreeDiffEntry, TreeDiffStream},
    object_id::ObjectId as _,
    ref_name::{RefNameBuf, RemoteNameBuf, RemoteRefSymbol},
    repo::Repo,
    repo_path::RepoPath,
    revset::{Revset, RevsetContainingFn, RevsetEvaluationError},
    rewrite,
    tree_merge::MergeOptions,
};
use pollster::FutureExt as _;

use crate::messages::{
    ChangeHunk, ChangeLocation, ChangeRange, MultilineString, RevSet, queries::*,
};
#[cfg(test)]
use crate::messages::{RevHeader, RevId};

use super::{WorkspaceSession, categories::FileCategories, git_util::get_git_remote_names};

struct LogStem {
    source: LogCoordinates,
    target: CommitId,
    indirect: bool,
    was_inserted: bool,
    known_immutable: bool,
}

/// state used for init or restart of a query
pub struct QueryState {
    /// max number of rows per page
    page_size: usize,
    /// number of rows already yielded
    next_row: usize,
    /// ongoing vertical lines; nodes will be placed on or around these
    stems: Vec<Option<LogStem>>,
    /// stem of a missing edge, kept until the next row so that nothing is drawn under its stub
    missing_stem: Option<usize>,
}

impl QueryState {
    pub fn new(page_size: usize) -> QueryState {
        QueryState {
            page_size,
            next_row: 0,
            stems: Vec::new(),
            missing_stem: None,
        }
    }
}

/// live instance of a query
pub struct QuerySession<'q, 'w: 'q> {
    pub ws: &'q WorkspaceSession<'w>,
    pub state: QueryState,
    #[allow(clippy::type_complexity)]
    stream: Pin<Box<dyn Stream<Item = Result<GraphNode<CommitId>, RevsetEvaluationError>> + 'q>>,
    /// pre-fetched node used for has_more peek semantics
    lookahead: Option<Result<GraphNode<CommitId>, RevsetEvaluationError>>,
    /// once the underlying stream returns None we must not poll it again
    stream_done: bool,
    is_immutable: Box<RevsetContainingFn<'q>>,
}

impl<'q, 'w> QuerySession<'q, 'w> {
    pub fn new(
        ws: &'q WorkspaceSession<'w>,
        revset: &'q dyn Revset,
        state: QueryState,
    ) -> QuerySession<'q, 'w> {
        let as_id: for<'a> fn(&'a CommitId) -> &'a CommitId = commit_id_identity;
        let mut stream: Pin<Box<dyn Stream<Item = _> + 'q>> =
            Box::pin(TopoGroupedGraph::new(revset.stream_graph(), as_id).stream());
        // skip already-yielded rows
        let mut stream_done = false;
        for _ in 0..state.next_row {
            match stream.next().block_on() {
                Some(_) => {}
                None => {
                    stream_done = true;
                    break;
                }
            }
        }

        let immutable_revset = ws.evaluate_immutable().unwrap();
        let is_immutable = immutable_revset.containing_fn();

        QuerySession {
            ws,
            stream,
            lookahead: None,
            stream_done,
            state,
            is_immutable,
        }
    }

    fn next_node(&mut self) -> Option<Result<GraphNode<CommitId>, RevsetEvaluationError>> {
        if let Some(item) = self.lookahead.take() {
            return Some(item);
        }
        if self.stream_done {
            return None;
        }
        match self.stream.next().block_on() {
            Some(item) => Some(item),
            None => {
                self.stream_done = true;
                None
            }
        }
    }

    fn has_more(&mut self) -> bool {
        if self.lookahead.is_some() {
            return true;
        }
        if self.stream_done {
            return false;
        }
        match self.stream.next().block_on() {
            Some(item) => {
                self.lookahead = Some(item);
                true
            }
            None => {
                self.stream_done = true;
                false
            }
        }
    }

    pub fn get_page(&mut self) -> Result<LogPage> {
        let mut rows: Vec<LogRow> = Vec::with_capacity(self.state.page_size); // output rows to draw
        let mut row = self.state.next_row;
        let max = row + self.state.page_size;

        let root_id = self.ws.repo().store().root_commit_id().clone();

        while let Some(Ok((commit_id, commit_edges))) = self.next_node() {
            // output lines to draw for the current row
            let mut lines: Vec<LogLine> = Vec::new();

            // find an existing stem targeting the current node
            let mut column = self.state.stems.len();
            let mut stem_known_immutable = false;
            let mut padding = 0; // used to offset the commit summary past some edges

            if let Some(slot) = self.find_stem_for_commit(&commit_id) {
                column = slot;
                padding = self.state.stems.len() - column - 1;
            }

            // terminate any existing stem, removing it from the end or leaving a gap
            if column < self.state.stems.len() {
                if let Some(terminated_stem) = &self.state.stems[column] {
                    stem_known_immutable = terminated_stem.known_immutable;
                    lines.push(if terminated_stem.was_inserted {
                        LogLine::FromNode {
                            indirect: terminated_stem.indirect,
                            source: terminated_stem.source,
                            target: LogCoordinates(column, row),
                        }
                    } else {
                        LogLine::ToNode {
                            indirect: terminated_stem.indirect,
                            source: terminated_stem.source,
                            target: LogCoordinates(column, row),
                        }
                    });
                }
                self.state.stems[column] = None;
            }
            // otherwise, slot into any gaps that might exist
            else {
                for (slot, stem) in self.state.stems.iter().enumerate() {
                    if stem.is_none() {
                        column = slot;
                        padding = self.state.stems.len() - slot - 1;
                        break;
                    }
                }
            }

            let known_immutable = if stem_known_immutable {
                Some(true)
            } else {
                Some((self.is_immutable)(&commit_id).block_on()?)
            };

            let header = self
                .ws
                .format_header(&self.ws.get_commit(&commit_id)?, known_immutable)?;

            // remove empty stems on the right edge
            let empty_stems = self
                .state
                .stems
                .iter()
                .rev()
                .take_while(|stem| stem.is_none())
                .count();
            self.state
                .stems
                .truncate(self.state.stems.len() - empty_stems);

            // merge edges into existing stems or add new ones to the right
            let mut next_missing: Option<CommitId> = None;
            'edges: for edge in commit_edges.iter() {
                if edge.edge_type == GraphEdgeType::Missing {
                    if edge.target == root_id {
                        continue;
                    } else {
                        next_missing = Some(edge.target.clone());
                    }
                }

                let indirect = edge.edge_type != GraphEdgeType::Direct;

                for (slot, stem) in self.state.stems.iter().enumerate() {
                    if let Some(stem) = stem
                        && stem.target == edge.target
                        && self.state.missing_stem != Some(slot)
                    {
                        lines.push(LogLine::ToIntersection {
                            indirect,
                            source: LogCoordinates(column, row),
                            target: LogCoordinates(slot, row + 1),
                        });
                        continue 'edges;
                    }
                }

                for stem in self.state.stems.iter_mut() {
                    if stem.is_none() {
                        *stem = Some(LogStem {
                            source: LogCoordinates(column, row),
                            target: edge.target.clone(),
                            indirect,
                            was_inserted: true,
                            known_immutable: header.is_immutable,
                        });
                        continue 'edges;
                    }
                }

                self.state.stems.push(Some(LogStem {
                    source: LogCoordinates(column, row),
                    target: edge.target.clone(),
                    indirect,
                    was_inserted: false,
                    known_immutable: header.is_immutable,
                }));
            }

            rows.push(LogRow {
                revision: header,
                location: LogCoordinates(column, row),
                padding,
                lines,
            });
            row += 1;

            if let Some(slot) = self.state.missing_stem.take() {
                self.state.stems[slot] = None;
            }

            // stub out missing edges into the next row, reserving the slot so nothing lands under the stub.
            // the stub can't have a row of its own, because the frontend treats locations as row indices
            if let Some(slot) = next_missing
                .take()
                .and_then(|id| self.find_stem_for_commit(&id))
            {
                if let Some(terminated_stem) = &self.state.stems[slot] {
                    rows.last_mut().unwrap().lines.push(LogLine::ToMissing {
                        indirect: terminated_stem.indirect,
                        source: LogCoordinates(column, row - 1),
                        target: LogCoordinates(slot, row),
                    });
                }
                self.state.missing_stem = Some(slot);
            };

            if row == max {
                break;
            }
        }

        self.state.next_row = row;
        let has_more = self.has_more();
        Ok(LogPage { rows, has_more })
    }

    fn find_stem_for_commit(&self, id: &CommitId) -> Option<usize> {
        for (slot, stem) in self.state.stems.iter().enumerate() {
            if let Some(LogStem { target, .. }) = stem
                && target == id
            {
                return Some(slot);
            }
        }

        None
    }
}

#[cfg(test)]
pub fn query_log(ws: &WorkspaceSession, revset_str: &str, max_results: usize) -> Result<LogPage> {
    let state = QueryState::new(max_results);
    let revset = ws.evaluate_revset_str(revset_str)?;
    let mut session = QuerySession::new(ws, &*revset, state);
    session.get_page()
}

#[cfg(test)]
pub fn query_revision(ws: &WorkspaceSession<'_>, id: &RevId) -> Result<Option<RevHeader>> {
    ws.resolve_optional_id(id)?
        .map(|c| ws.format_header(&c, None))
        .transpose()
}

/// Read display details for a revset (limited to sequences). Returns headers in topological order (children first).
pub async fn query_revisions(ws: &WorkspaceSession<'_>, set: RevSet) -> Result<RevsResult> {
    // resolve singleton or arbitrary revset
    let commits = if set.from.change.hex == set.to.change.hex {
        match ws.resolve_optional_id(&set.from)? {
            Some(commit) => vec![commit],
            None => return Ok(RevsResult::NotFound { set }),
        }
    } else {
        match ws.resolve_optional_set(&set)? {
            Some(commits) => commits,
            None => return Ok(RevsResult::NotFound { set }),
        }
    };

    // trees before and after the revset
    let oldest_commit = commits.last().ok_or(anyhow!("slice is_empty()"))?;
    let oldest_parents = oldest_commit.parents().await?;
    let parent_tree = rewrite::merge_commit_trees(ws.repo(), &oldest_parents).await?;

    let newest_commit = commits.first().ok_or(anyhow!("slice is_empty()"))?;
    let final_tree = newest_commit.tree();
    let mut categories = FileCategories::new(&final_tree);

    // compute combined changes: diff from parents to final
    let mut changes = Vec::new();
    let tree_diff = parent_tree.diff_stream(&final_tree, &EverythingMatcher);
    let conflict_labels = Diff::new(parent_tree.labels(), final_tree.labels());
    format_tree_changes(
        ws,
        &mut changes,
        tree_diff,
        conflict_labels,
        3,
        &mut categories,
    )
    .await?;

    let mut conflicts = Vec::new();
    for (path, entry) in final_tree.entries() {
        if let Ok(entry) = entry
            && !entry.is_resolved()
        {
            match conflicts::materialize_tree_value(
                ws.repo().store(),
                &path,
                entry,
                final_tree.labels(),
            )
            .await?
            {
                MaterializedTreeValue::FileConflict(file) => {
                    let mut hunk_content = vec![];
                    conflicts::materialize_merge_result(
                        &file.contents,
                        &file.labels,
                        &mut hunk_content,
                        &ConflictMaterializeOptions {
                            marker_style: ConflictMarkerStyle::Git,
                            marker_len: None,
                            merge: MergeOptions {
                                hunk_level: FileMergeHunkLevel::Line,
                                same_change: SameChange::Accept,
                            },
                        },
                    )?;
                    let mut hunks = get_unified_hunks(3, &hunk_content, &[])?;
                    if let Some(hunk) = hunks.pop() {
                        conflicts.push(RevConflict {
                            category: Some(categories.category(&path).await?),
                            path: ws.format_path(path)?,
                            hunk,
                        });
                    }
                }
                _ => {
                    log::warn!("nonresolved tree entry did not materialise as conflict");
                }
            }
        }
    }

    let conflicted_paths: HashSet<String> = conflicts
        .iter()
        .map(|conflict| conflict.path.repo_path.clone())
        .collect();
    changes.retain(|change| !conflicted_paths.contains(&change.path.repo_path));

    // details for each revision in the set
    let mut headers = Vec::new();
    let mut known_immutable: Option<bool> = None;
    for commit in &commits {
        // optimization: once we find an immutable revision, its ancestors must be immutable too
        let header = ws.format_header(commit, known_immutable)?;
        if known_immutable.is_none() && header.is_immutable {
            known_immutable = Some(true);
        }
        headers.push(header);
    }

    // optimization: if anything was immutable, the oldest revision's parents must also be immutable
    let parents = oldest_commit
        .parents()
        .await?
        .iter()
        .map(|p| ws.format_header(p, known_immutable))
        .collect::<Result<Vec<_>, _>>()?;

    Ok(RevsResult::Detail {
        set,
        headers,
        parents,
        changes,
        conflicts,
    })
}

pub fn resolve_revision_selection(
    ws: &WorkspaceSession<'_>,
    id: crate::messages::RevId,
) -> Result<RevisionSelectionResult> {
    let exact = if id.commit.hex.is_empty() {
        let set = RevSet {
            from: id.clone(),
            to: id.clone(),
        };
        resolve_exact_set(ws, &set)?
            .and_then(|(commits, _)| commits.into_iter().next())
            .map(|commit| ws.format_header(&commit, None))
            .transpose()?
    } else {
        exact_commit(ws, &id.commit)?
            .map(|commit| ws.format_header(&commit, None))
            .transpose()?
    };
    let candidates = match ws.evaluate_revset_changes(std::slice::from_ref(&id.change)) {
        Ok(revset) => ws
            .resolve_multiple(revset)?
            .iter()
            .map(|commit| ws.format_header(commit, None))
            .collect::<Result<Vec<_>, _>>()?,
        Err(super::gui_util::RevsetError::Resolution(
            jj_lib::revset::RevsetResolutionError::DivergentChangeId {
                visible_targets, ..
            },
        )) => visible_targets
            .into_iter()
            .map(|(_, id)| {
                ws.get_commit(&id)
                    .and_then(|commit| ws.format_header(&commit, None))
            })
            .collect::<Result<Vec<_>>>()?,
        Err(super::gui_util::RevsetError::Resolution(
            jj_lib::revset::RevsetResolutionError::NoSuchRevision { .. },
        )) => Vec::new(),
        Err(err) => return Err(err.into()),
    };
    let exact = if id.commit.hex.is_empty() && candidates.len() > 1 {
        None
    } else {
        exact
    };
    Ok(RevisionSelectionResult { exact, candidates })
}

fn exact_commit(
    ws: &WorkspaceSession<'_>,
    id: &crate::messages::CommitId,
) -> Result<Option<jj_lib::commit::Commit>> {
    let commit_id = CommitId::try_from_hex(&id.hex).ok_or_else(|| anyhow!("invalid commit ID"))?;
    match ws.repo().store().get_commit(&commit_id) {
        Ok(_) => {}
        Err(BackendError::ObjectNotFound { object_type, .. }) if object_type == "commit" => {
            return Ok(None);
        }
        Err(err) => return Err(err.into()),
    }
    let revset = match ws.evaluate_revset_commits(std::slice::from_ref(id)) {
        Ok(revset) => revset,
        Err(super::gui_util::RevsetError::Resolution(
            jj_lib::revset::RevsetResolutionError::NoSuchRevision { .. },
        )) => return Ok(None),
        Err(err) => return Err(err.into()),
    };
    let mut commits = ws.resolve_multiple(revset)?;
    Ok(if commits.len() == 1 {
        commits.pop()
    } else {
        None
    })
}

fn resolve_exact_set(
    ws: &WorkspaceSession<'_>,
    set: &RevSet,
) -> Result<Option<(Vec<jj_lib::commit::Commit>, RevSet)>> {
    fn endpoint(
        ws: &WorkspaceSession<'_>,
        id: &crate::messages::RevId,
    ) -> Result<Option<jj_lib::commit::Commit>> {
        let revset = if id.commit.hex.is_empty() {
            let expression = match id.change.offset {
                Some(offset) => format!("{}/{}", id.change.hex, offset),
                None => id.change.hex.clone(),
            };
            match ws.evaluate_revset_str(&expression) {
                Ok(revset) => revset,
                Err(super::gui_util::RevsetError::Resolution(
                    jj_lib::revset::RevsetResolutionError::NoSuchRevision { .. }
                    | jj_lib::revset::RevsetResolutionError::DivergentChangeId { .. },
                )) => return Ok(None),
                Err(err) => return Err(err.into()),
            }
        } else {
            return exact_commit(ws, &id.commit);
        };
        let mut commits = ws.resolve_multiple(revset)?;
        if commits.len() == 1 {
            Ok(commits.pop())
        } else {
            Ok(None)
        }
    }
    let Some(from) = endpoint(ws, &set.from)? else {
        return Ok(None);
    };
    let Some(to) = endpoint(ws, &set.to)? else {
        return Ok(None);
    };
    let resolved = RevSet {
        from: ws.format_header(&from, None)?.id,
        to: ws.format_header(&to, None)?.id,
    };
    if from.id() == to.id() {
        return Ok(Some((vec![from], resolved)));
    }
    let expression = format!("{}::{}", from.id().hex(), to.id().hex());
    let commits = ws.resolve_multiple(ws.evaluate_revset_str(&expression)?)?;
    if commits.is_empty() {
        Ok(None)
    } else {
        Ok(Some((commits, resolved)))
    }
}

pub async fn query_revision_summary(
    ws: &WorkspaceSession<'_>,
    set: RevSet,
) -> Result<RevisionSummaryResult> {
    let commits = resolve_exact_set(ws, &set)?;
    let Some((commits, set)) = commits else {
        return Ok(RevisionSummaryResult::NotFound { set });
    };
    let oldest = commits.last().ok_or(anyhow!("empty revision set"))?;
    let oldest_parents = oldest.parents().await?;
    let parent_tree = rewrite::merge_commit_trees(ws.repo(), &oldest_parents).await?;
    let final_tree = commits.first().ok_or(anyhow!("empty revision set"))?.tree();
    let mut entries = Vec::new();
    let mut stream = parent_tree.diff_stream(&final_tree, &EverythingMatcher);
    while let Some(TreeDiffEntry { path, values }) = stream.next().await {
        entries.push((path, values?));
    }
    let store = ws.repo().store();
    let labels = Diff::new(parent_tree.labels(), final_tree.labels());
    let with_stats = entries.len() <= SUMMARY_STAT_FILE_LIMIT;
    let mut changes = Vec::with_capacity(entries.len());
    let mut categories = FileCategories::new(&final_tree);
    for (path, diff) in entries {
        let kind = if diff.before.is_present() && diff.after.is_present() {
            ChangeKind::Modified
        } else if diff.before.is_absent() {
            ChangeKind::Added
        } else {
            ChangeKind::Deleted
        };
        let has_conflict = !diff.after.is_resolved();
        let stat = if with_stats && !has_conflict {
            let before =
                conflicts::materialize_tree_value(store, &path, diff.before, labels.before);
            let after = conflicts::materialize_tree_value(store, &path, diff.after, labels.after);
            let (before, after) = try_join!(before, after)?;
            get_value_stat(&path, before, after).await?
        } else {
            None
        };
        changes.push(RevChangeSummary {
            category: Some(categories.category(&path).await?),
            kind,
            path: ws.format_path(path)?,
            has_conflict,
            stat,
        });
    }
    let mut conflicts = Vec::new();
    for (path, entry) in final_tree.entries() {
        if !entry?.is_resolved() {
            conflicts.push(ws.format_path(path)?);
        }
    }
    let mut conflict_categories = std::collections::HashMap::new();
    for path in &conflicts {
        let repo_path = RepoPath::from_internal_string(&path.repo_path)?;
        conflict_categories.insert(
            path.repo_path.clone(),
            categories.category(repo_path).await?,
        );
    }
    let conflicted_paths: HashSet<_> = conflicts
        .iter()
        .map(|path| path.repo_path.as_str())
        .collect();
    changes.retain(|change| !conflicted_paths.contains(change.path.repo_path.as_str()));
    let mut headers = Vec::new();
    let mut known_immutable = None;
    for commit in &commits {
        let header = ws.format_header(commit, known_immutable)?;
        if known_immutable.is_none() && header.is_immutable {
            known_immutable = Some(true);
        }
        headers.push(header);
    }
    let parents = oldest_parents
        .iter()
        .map(|p| ws.format_header(p, known_immutable))
        .collect::<Result<Vec<_>, _>>()?;
    Ok(RevisionSummaryResult::Detail {
        conflict_categories: (!conflict_categories.is_empty()).then_some(conflict_categories),
        set,
        headers,
        parents,
        changes,
        conflicts,
    })
}

pub async fn query_revision_diff(
    ws: &WorkspaceSession<'_>,
    set: RevSet,
    path: crate::messages::TreePath,
    full_context: bool,
) -> Result<RevisionDiffResult> {
    let commits = resolve_exact_set(ws, &set)?;
    let Some((commits, set)) = commits else {
        return Ok(RevisionDiffResult::NotFound { set });
    };
    let oldest = commits.last().ok_or(anyhow!("empty revision set"))?;
    let parent_tree = rewrite::merge_commit_trees(ws.repo(), &oldest.parents().await?).await?;
    let final_tree = commits.first().ok_or(anyhow!("empty revision set"))?.tree();
    let mut categories = FileCategories::new(&final_tree);
    let repo_path = RepoPath::from_internal_string(&path.repo_path)?;
    let matcher = FilesMatcher::new([repo_path]);
    let mut changes = Vec::new();
    format_tree_changes(
        ws,
        &mut changes,
        parent_tree.diff_stream(&final_tree, &matcher),
        Diff::new(parent_tree.labels(), final_tree.labels()),
        if full_context { usize::MAX } else { 3 },
        &mut categories,
    )
    .await?;
    let mut conflict = None;
    for (entry_path, entry) in final_tree.entries_matching(&matcher) {
        let entry = entry?;
        if !entry.is_resolved() {
            let value = conflicts::materialize_tree_value(
                ws.repo().store(),
                &entry_path,
                entry,
                final_tree.labels(),
            )
            .await?;
            let content = get_value_contents(&entry_path, value).await?;
            if let Some(hunk) = match content {
                Some(content) => get_unified_hunks(3, &content, &[])?.pop(),
                None => None,
            } {
                conflict = Some(RevConflict {
                    category: Some(categories.category(&entry_path).await?),
                    path: ws.format_path(entry_path)?,
                    hunk,
                });
            }
        }
    }
    let change = if conflict.is_some() {
        None
    } else {
        changes.into_iter().next()
    };
    Ok(RevisionDiffResult::Detail {
        set,
        path,
        change,
        conflict,
    })
}

pub fn query_remotes(
    ws: &WorkspaceSession,
    tracking_bookmark: Option<String>,
) -> Result<Vec<String>> {
    let git_repo = match ws.git_repo() {
        Some(git_repo) => git_repo,
        None => return Err(anyhow!("No git backend")),
    };

    let all_remotes = get_git_remote_names(&git_repo);

    let matching_remotes = match tracking_bookmark {
        Some(bookmark_name) => all_remotes
            .into_iter()
            .filter(|remote_name| {
                let remote_name_ref = RemoteNameBuf::from(remote_name);
                let bookmark_name_ref = RefNameBuf::from(bookmark_name.clone());
                let remote_ref_symbol = RemoteRefSymbol {
                    name: &bookmark_name_ref,
                    remote: &remote_name_ref,
                };
                let remote_ref = ws.view().get_remote_bookmark(remote_ref_symbol);
                !remote_ref.is_absent() && remote_ref.is_tracked()
            })
            .collect(),
        None => all_remotes,
    };

    Ok(matching_remotes)
}

pub(super) async fn format_tree_changes(
    ws: &WorkspaceSession<'_>,
    changes: &mut Vec<RevChange>,
    mut tree_diff: TreeDiffStream<'_>,
    conflict_labels: Diff<&ConflictLabels>,
    context_lines: usize,
    categories: &mut FileCategories<'_>,
) -> Result<()> {
    let store = ws.repo().store();

    while let Some(TreeDiffEntry { path, values }) = tree_diff.next().await {
        let diff = values?;
        let before = &diff.before;
        let after = &diff.after;

        let kind = if before.is_present() && after.is_present() {
            ChangeKind::Modified
        } else if before.is_absent() {
            ChangeKind::Added
        } else {
            ChangeKind::Deleted
        };

        let has_conflict = !after.is_resolved();

        let before_future =
            conflicts::materialize_tree_value(store, &path, before.clone(), conflict_labels.before);
        let after_future =
            conflicts::materialize_tree_value(store, &path, after.clone(), conflict_labels.after);
        let (before_value, after_value) = try_join!(before_future, after_future)?;

        let hunks = get_value_hunks(context_lines, &path, before_value, after_value).await?;

        changes.push(RevChange {
            category: Some(categories.category(&path).await?),
            path: ws.format_path(path)?,
            kind,
            has_conflict,
            hunks,
            stat: None,
        });
    }
    Ok(())
}

// stats read every changed file; beyond this the summary must stay metadata-only
const SUMMARY_STAT_FILE_LIMIT: usize = 400;

async fn get_value_stat(
    path: &RepoPath,
    left_value: MaterializedTreeValue,
    right_value: MaterializedTreeValue,
) -> Result<Option<LineStat>> {
    let left_part = if left_value.is_absent() {
        Some(Vec::new())
    } else {
        get_value_contents(path, left_value).await?
    };
    let right_part = if right_value.is_absent() {
        Some(Vec::new())
    } else {
        get_value_contents(path, right_value).await?
    };
    let (Some(left), Some(right)) = (left_part, right_part) else {
        return Ok(None);
    };
    let mut stat = LineStat {
        added: 0,
        removed: 0,
    };
    let options = UnifiedDiffOptions {
        context: 0,
        line_diff: LineDiffOptions {
            compare_mode: LineCompareMode::Exact,
        },
    };
    for hunk in unified_diff_hunks(&left, &right, &options) {
        for (line_type, _) in hunk.lines {
            match line_type {
                DiffLineType::Added => stat.added += 1,
                DiffLineType::Removed => stat.removed += 1,
                DiffLineType::Context => {}
            }
        }
    }
    Ok(Some(stat))
}

async fn get_value_hunks(
    num_context_lines: usize,
    path: &RepoPath,
    left_value: MaterializedTreeValue,
    right_value: MaterializedTreeValue,
) -> Result<Vec<ChangeHunk>> {
    let left_part = if left_value.is_absent() {
        Some(Vec::new())
    } else {
        get_value_contents(path, left_value).await?
    };
    let right_part = if right_value.is_absent() {
        Some(Vec::new())
    } else {
        get_value_contents(path, right_value).await?
    };
    match (left_part, right_part) {
        (Some(left), Some(right)) => get_unified_hunks(num_context_lines, &left, &right),
        _ => Ok(Vec::new()),
    }
}

async fn get_value_contents(
    path: &RepoPath,
    value: MaterializedTreeValue,
) -> Result<Option<Vec<u8>>> {
    match value {
        MaterializedTreeValue::Absent => Err(anyhow!(
            "Absent path {path:?} in diff should have been handled by caller"
        )),
        MaterializedTreeValue::File(MaterializedFileValue { mut reader, .. }) => {
            let mut contents = vec![];
            reader.read_to_end(&mut contents).await?;

            let start = &contents[..8000.min(contents.len())]; // same heuristic git uses
            let is_binary = start.contains(&b'\0');
            Ok((!is_binary).then_some(contents))
        }
        MaterializedTreeValue::Symlink { target, .. } => Ok(Some(target.into_bytes())),
        MaterializedTreeValue::GitSubmodule(_) => Ok(Some("(submodule)".to_owned().into_bytes())),
        MaterializedTreeValue::FileConflict(file) => {
            let mut hunk_content = vec![];
            conflicts::materialize_merge_result(
                &file.contents,
                &file.labels,
                &mut hunk_content,
                &ConflictMaterializeOptions {
                    marker_style: ConflictMarkerStyle::Git,
                    marker_len: None,
                    merge: MergeOptions {
                        hunk_level: FileMergeHunkLevel::Line,
                        same_change: SameChange::Accept,
                    },
                },
            )?;
            Ok(Some(hunk_content))
        }
        MaterializedTreeValue::OtherConflict { id, labels } => {
            Ok(Some(id.describe(&labels).into_bytes()))
        }
        MaterializedTreeValue::Tree(_) => Err(anyhow!("Unexpected tree in diff at path {path:?}")),
        MaterializedTreeValue::AccessDenied(error) => Err(anyhow!(error)),
    }
}

pub(super) fn get_unified_hunks(
    num_context_lines: usize,
    left_content: &[u8],
    right_content: &[u8],
) -> Result<Vec<ChangeHunk>> {
    let mut hunks = Vec::new();

    for hunk in unified_diff_hunks(
        left_content,
        right_content,
        &UnifiedDiffOptions {
            context: num_context_lines,
            line_diff: LineDiffOptions {
                compare_mode: LineCompareMode::Exact,
            },
        },
    ) {
        let location = ChangeLocation {
            from_file: ChangeRange {
                start: hunk.left_line_range.start,
                len: hunk.left_line_range.len(),
            },
            to_file: ChangeRange {
                start: hunk.right_line_range.start,
                len: hunk.right_line_range.len(),
            },
        };

        let mut lines = Vec::new();
        for (line_type, tokens) in hunk.lines {
            let mut formatter: Vec<u8> = vec![];
            match line_type {
                DiffLineType::Context => {
                    write!(formatter, " ")?;
                }
                DiffLineType::Removed => {
                    write!(formatter, "-")?;
                }
                DiffLineType::Added => {
                    write!(formatter, "+")?;
                }
            }

            for (token_type, content) in tokens {
                match token_type {
                    DiffTokenType::Matching => formatter.write_all(content)?,
                    DiffTokenType::Different => formatter.write_all(content)?, // XXX mark this for GUI display
                }
            }

            lines.push(String::from_utf8_lossy(&formatter).into_owned());
        }

        hunks.push(ChangeHunk {
            location,
            lines: MultilineString { lines },
        });
    }

    Ok(hunks)
}

/**************************/
/* from jj_cli::diff_util */
/**************************/

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct UnifiedDiffOptions {
    /// Number of context lines to show.
    pub context: usize,
    /// How lines are tokenized and compared.
    pub line_diff: LineDiffOptions,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum DiffLineType {
    Context,
    Removed,
    Added,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum DiffTokenType {
    Matching,
    Different,
}

type DiffTokenVec<'content> = Vec<(DiffTokenType, &'content [u8])>;

struct UnifiedDiffHunk<'content> {
    left_line_range: Range<usize>,
    right_line_range: Range<usize>,
    lines: Vec<(DiffLineType, DiffTokenVec<'content>)>,
}

impl<'content> UnifiedDiffHunk<'content> {
    fn extend_context_lines(&mut self, lines: impl IntoIterator<Item = &'content [u8]>) {
        let old_len = self.lines.len();
        self.lines.extend(lines.into_iter().map(|line| {
            let tokens = vec![(DiffTokenType::Matching, line)];
            (DiffLineType::Context, tokens)
        }));
        self.left_line_range.end += self.lines.len() - old_len;
        self.right_line_range.end += self.lines.len() - old_len;
    }

    fn extend_removed_lines(&mut self, lines: impl IntoIterator<Item = DiffTokenVec<'content>>) {
        let old_len = self.lines.len();
        self.lines
            .extend(lines.into_iter().map(|line| (DiffLineType::Removed, line)));
        self.left_line_range.end += self.lines.len() - old_len;
    }

    fn extend_added_lines(&mut self, lines: impl IntoIterator<Item = DiffTokenVec<'content>>) {
        let old_len = self.lines.len();
        self.lines
            .extend(lines.into_iter().map(|line| (DiffLineType::Added, line)));
        self.right_line_range.end += self.lines.len() - old_len;
    }
}

fn unified_diff_hunks<'content>(
    left_content: &'content [u8],
    right_content: &'content [u8],
    options: &UnifiedDiffOptions,
) -> Vec<UnifiedDiffHunk<'content>> {
    let mut hunks = vec![];
    let mut current_hunk = UnifiedDiffHunk {
        left_line_range: 1..1,
        right_line_range: 1..1,
        lines: vec![],
    };
    let diff = diff_by_line([left_content, right_content], &options.line_diff);
    let mut diff_hunks = diff.hunks().peekable();
    while let Some(hunk) = diff_hunks.next() {
        match hunk.kind {
            DiffHunkKind::Matching => {
                // Just use the right (i.e. new) content. We could count the
                // number of skipped lines separately, but the number of the
                // context lines should match the displayed content.
                let [_, right] = hunk.contents[..].try_into().unwrap();
                let mut lines = right.split_inclusive(|b| *b == b'\n').fuse();
                if !current_hunk.lines.is_empty() {
                    // The previous hunk line should be either removed/added.
                    current_hunk.extend_context_lines(lines.by_ref().take(options.context));
                }
                let before_lines = if diff_hunks.peek().is_some() {
                    lines.by_ref().rev().take(options.context).collect()
                } else {
                    vec![] // No more hunks
                };
                let num_skip_lines = lines.count();
                if num_skip_lines > 0 {
                    let left_start = current_hunk.left_line_range.end + num_skip_lines;
                    let right_start = current_hunk.right_line_range.end + num_skip_lines;
                    if !current_hunk.lines.is_empty() {
                        hunks.push(current_hunk);
                    }
                    current_hunk = UnifiedDiffHunk {
                        left_line_range: left_start..left_start,
                        right_line_range: right_start..right_start,
                        lines: vec![],
                    };
                }
                // The next hunk should be of DiffHunk::Different type if any.
                current_hunk.extend_context_lines(before_lines.into_iter().rev());
            }
            DiffHunkKind::Different => {
                let (left_lines, right_lines) =
                    unzip_diff_hunks_to_lines(ContentDiff::by_word(hunk.contents).hunks());
                current_hunk.extend_removed_lines(left_lines);
                current_hunk.extend_added_lines(right_lines);
            }
        }
    }
    if !current_hunk.lines.is_empty() {
        hunks.push(current_hunk);
    }
    hunks
}

/// Splits `(left, right)` hunk pairs into `(left_lines, right_lines)`.
#[allow(dead_code)]
fn unzip_diff_hunks_to_lines<'content, I>(
    diff_hunks: I,
) -> (Vec<DiffTokenVec<'content>>, Vec<DiffTokenVec<'content>>)
where
    I: IntoIterator,
    I::Item: Borrow<DiffHunk<'content>>,
{
    let mut left_lines: Vec<DiffTokenVec<'content>> = vec![];
    let mut right_lines: Vec<DiffTokenVec<'content>> = vec![];
    let mut left_tokens: DiffTokenVec<'content> = vec![];
    let mut right_tokens: DiffTokenVec<'content> = vec![];

    for hunk in diff_hunks {
        let hunk = hunk.borrow();
        match hunk.kind {
            DiffHunkKind::Matching => {
                // TODO: add support for unmatched contexts
                debug_assert!(hunk.contents.iter().all_equal());
                for token in hunk.contents[0].split_inclusive(|b| *b == b'\n') {
                    left_tokens.push((DiffTokenType::Matching, token));
                    right_tokens.push((DiffTokenType::Matching, token));
                    if token.ends_with(b"\n") {
                        left_lines.push(mem::take(&mut left_tokens));
                        right_lines.push(mem::take(&mut right_tokens));
                    }
                }
            }
            DiffHunkKind::Different => {
                let [left, right] = hunk.contents[..]
                    .try_into()
                    .expect("hunk should have exactly two inputs");
                for token in left.split_inclusive(|b| *b == b'\n') {
                    left_tokens.push((DiffTokenType::Different, token));
                    if token.ends_with(b"\n") {
                        left_lines.push(mem::take(&mut left_tokens));
                    }
                }
                for token in right.split_inclusive(|b| *b == b'\n') {
                    right_tokens.push((DiffTokenType::Different, token));
                    if token.ends_with(b"\n") {
                        right_lines.push(mem::take(&mut right_tokens));
                    }
                }
            }
        }
    }

    if !left_tokens.is_empty() {
        left_lines.push(left_tokens);
    }
    if !right_tokens.is_empty() {
        right_lines.push(right_tokens);
    }
    (left_lines, right_lines)
}

fn diff_by_line<'input, T: AsRef<[u8]> + ?Sized + 'input>(
    inputs: impl IntoIterator<Item = &'input T>,
    options: &LineDiffOptions,
) -> jj_lib::diff::ContentDiff<'input> {
    // TODO: If we add --ignore-blank-lines, its tokenizer will have to attach
    // blank lines to the preceding range. Maybe it can also be implemented as a
    // post-process (similar to refine_changed_regions()) that expands unchanged
    // regions across blank lines.
    match options.compare_mode {
        LineCompareMode::Exact => {
            ContentDiff::for_tokenizer(inputs, find_line_ranges, CompareBytesExactly)
        }
        LineCompareMode::IgnoreAllSpace => {
            ContentDiff::for_tokenizer(inputs, find_line_ranges, CompareBytesIgnoreAllWhitespace)
        }
        LineCompareMode::IgnoreSpaceChange => {
            ContentDiff::for_tokenizer(inputs, find_line_ranges, CompareBytesIgnoreWhitespaceAmount)
        }
    }
}

fn commit_id_identity(commit_id: &CommitId) -> &CommitId {
    commit_id
}

#[cfg(test)]
mod binary_hunk_tests {
    use super::*;
    use jj_lib::backend::{CopyId, FileId};

    fn file(bytes: &[u8]) -> MaterializedTreeValue {
        MaterializedTreeValue::File(MaterializedFileValue {
            id: FileId::new(vec![0; 20]),
            executable: false,
            copy_id: CopyId::placeholder(),
            reader: Box::pin(futures_util::io::Cursor::new(bytes.to_vec())),
        })
    }

    #[test]
    fn whole_file_context_keeps_prefix_suffix_and_separated_changes() -> Result<()> {
        let left: String = (0..80).map(|i| format!("line {i}\n")).collect();
        let right = left
            .replace("line 20\n", "changed 20\n")
            .replace("line 60\n", "changed 60\n");
        let compact = get_unified_hunks(3, left.as_bytes(), right.as_bytes())?;
        let full = get_unified_hunks(usize::MAX, left.as_bytes(), right.as_bytes())?;
        assert_eq!(compact.len(), 2);
        assert_eq!(full.len(), 1);
        let lines = &full[0].lines.lines;
        assert_eq!(lines.first().map(String::as_str), Some(" line 0\n"));
        assert_eq!(lines.last().map(String::as_str), Some(" line 79\n"));
        assert!(lines.iter().any(|line| line == "-line 20\n"));
        assert!(lines.iter().any(|line| line == "+changed 60\n"));
        Ok(())
    }

    #[tokio::test]
    async fn binary_content_never_produces_editable_hunks() -> Result<()> {
        let path = RepoPath::from_internal_string("binary.dat")?;
        for (left, right) in [
            (file(b"a\0one"), file(b"b\0two")),
            (MaterializedTreeValue::Absent, file(b"a\0one")),
            (file(b"a\0one"), MaterializedTreeValue::Absent),
            (file(b"text\n"), file(b"a\0one")),
            (file(b"a\0one"), file(b"text\n")),
        ] {
            assert!(get_value_hunks(3, path, left, right).await?.is_empty());
        }
        assert!(
            !get_value_hunks(3, path, file(b"(binary)"), file(b"text\n"))
                .await?
                .is_empty()
        );
        Ok(())
    }
}
