use anyhow::{Result, anyhow};
use futures_util::{StreamExt as _, TryStreamExt as _};
use jj_lib::{
    backend::CommitId,
    commit::Commit,
    evolution,
    object_id::ObjectId as _,
    op_walk,
    operation::Operation,
    repo::Repo as _,
    revset::{RevsetExpression, RevsetStreamExt as _},
};

use super::WorkspaceSession;
use crate::messages::{RevId, queries::*};

const PAGE_SIZE: usize = 40;

fn revision(ws: &WorkspaceSession<'_>, commit: &Commit) -> Result<HistoryRevision> {
    Ok(HistoryRevision {
        id: ws.format_id(commit),
        description: commit.description().into(),
        author: commit.author().try_into()?,
        parent_ids: commit.parent_ids().iter().map(|id| id.hex()).collect(),
        has_conflict: commit.has_conflict(),
    })
}

fn operation(op: &Operation) -> Result<OperationRecord> {
    let metadata = op.metadata();
    Ok(OperationRecord {
        id: op.id().hex(),
        parent_ids: op.parent_ids().iter().map(|id| id.hex()).collect(),
        description: metadata.description.clone(),
        started_at: metadata.time.start.to_datetime()?.to_rfc3339(),
        finished_at: metadata.time.end.to_datetime()?.to_rfc3339(),
        username: metadata.username.clone(),
        hostname: metadata.hostname.clone(),
        workspace: metadata
            .workspace_name
            .as_ref()
            .map(|name| name.as_str().to_owned()),
        is_snapshot: metadata.is_snapshot,
    })
}

pub async fn evolution_page(
    ws: &WorkspaceSession<'_>,
    id: RevId,
    offset: usize,
) -> Result<EvolutionPage> {
    let commit_id =
        CommitId::try_from_hex(&id.commit.hex).ok_or_else(|| anyhow!("invalid commit ID"))?;
    let start = ws.repo().store().get_commit(&commit_id)?;
    if start.change_id().reverse_hex() != id.change.hex {
        return Err(anyhow!("the commit does not belong to this change"));
    }
    let mut stream = evolution::walk_predecessors(ws.repo(), &[commit_id])
        .fuse()
        .boxed_local();
    for _ in 0..offset {
        if stream.try_next().await?.is_none() {
            break;
        }
    }
    let mut entries = Vec::new();
    for _ in 0..PAGE_SIZE {
        let Some(entry) = stream.try_next().await? else {
            break;
        };
        entries.push(EvolutionEntry {
            revision: revision(ws, &entry.commit)?,
            predecessor_ids: entry.predecessor_ids().iter().map(|id| id.hex()).collect(),
            operation: entry.operation.as_ref().map(operation).transpose()?,
        });
    }
    Ok(EvolutionPage {
        entries,
        has_more: stream.try_next().await?.is_some(),
    })
}

pub const TREE_LIMIT: usize = 50_000;

pub fn revision_tree(ws: &WorkspaceSession<'_>, id: RevId) -> Result<RevisionTree> {
    let commit_id =
        CommitId::try_from_hex(&id.commit.hex).ok_or_else(|| anyhow!("invalid commit ID"))?;
    let commit = ws.repo().store().get_commit(&commit_id)?;
    if commit.change_id().reverse_hex() != id.change.hex {
        return Err(anyhow!("the commit does not belong to this change"));
    }
    let mut files = Vec::new();
    let mut truncated = false;
    for (path, value) in commit.tree().entries() {
        // conflicted paths appear once, as a single entry
        if value?.is_absent() {
            continue;
        }
        if files.len() == TREE_LIMIT {
            truncated = true;
            break;
        }
        files.push(path.as_internal_file_string().to_owned());
    }
    files.sort();
    Ok(RevisionTree { files, truncated })
}

pub async fn operation_page(
    ws: &WorkspaceSession<'_>,
    head: Option<String>,
    offset: usize,
) -> Result<OperationPage> {
    let head = match head {
        Some(id) => op_walk::resolve_op_with_repo(ws.repo(), &id).await?,
        None => ws.repo().operation().clone(),
    };
    let mut stream = op_walk::walk_ancestors(std::slice::from_ref(&head))
        .fuse()
        .boxed_local();
    for _ in 0..offset {
        if stream.try_next().await?.is_none() {
            break;
        }
    }
    let mut entries = Vec::new();
    for _ in 0..PAGE_SIZE {
        let Some(op) = stream.try_next().await? else {
            break;
        };
        entries.push(operation(&op)?);
    }
    Ok(OperationPage {
        head_id: head.id().hex(),
        entries,
        has_more: stream.try_next().await?.is_some(),
    })
}

pub async fn operation_detail(ws: &WorkspaceSession<'_>, id: String) -> Result<OperationDetail> {
    let op = op_walk::resolve_op_with_repo(ws.repo(), &id).await?;
    // loading a past view must never check it out or snapshot the working copy
    let repo = ws.repo().loader().load_at(&op).await?;
    let view = repo.view();
    let revset = ws.evaluate_revset_expr(repo.as_ref(), RevsetExpression::all())?;
    let commits = revset
        .stream()
        .commits(repo.store())
        .take(61)
        .try_collect::<Vec<_>>()
        .await?;
    let revisions = commits
        .iter()
        .take(60)
        .map(|commit| revision(ws, commit))
        .collect::<Result<_>>()?;
    let mut heads: Vec<_> = view.heads().iter().map(|id| id.hex()).collect();
    heads.sort();
    let bookmarks = view
        .local_bookmarks()
        .map(|(name, target)| HistoricalBookmark {
            name: name.as_str().to_owned(),
            added_ids: target.adds().flatten().map(|id| id.hex()).collect(),
            removed_ids: target.removes().flatten().map(|id| id.hex()).collect(),
            has_conflict: !target.is_resolved(),
        })
        .collect();
    let workspaces = view
        .wc_commit_ids()
        .iter()
        .map(|(name, id)| HistoricalWorkspace {
            name: name.as_str().to_owned(),
            commit_id: id.hex(),
        })
        .collect();
    Ok(OperationDetail {
        operation: operation(&op)?,
        parents: op
            .parents()
            .await?
            .iter()
            .map(operation)
            .collect::<Result<_>>()?,
        revisions,
        has_more_revisions: commits.len() > 60,
        heads,
        bookmarks,
        workspaces,
    })
}
