use super::mutations::precondition;
use super::{Mutation, WorkspaceSession};
use crate::{
    messages::{
        mutations::{MutationOptions, MutationResult},
        splits::{SplitOwner, SplitOwnership, SplitRevision},
    },
    splits::{SplitReceipt, SplitStore},
};
use anyhow::{Result, anyhow};
use async_trait::async_trait;
use chrono::Utc;
use futures_util::{StreamExt as _, TryStreamExt as _};
use jj_lib::{
    backend::CommitId,
    commit::conflict_label_for_commits,
    matchers::{EverythingMatcher, FilesMatcher},
    object_id::ObjectId as _,
    repo::Repo as _,
    repo_path::RepoPath,
    revset::RevsetStreamExt as _,
    rewrite,
};

pub(crate) async fn active_receipts(ws: &WorkspaceSession<'_>) -> Result<Vec<SplitReceipt>> {
    let store = SplitStore::for_repo(ws.workspace.repo_path(), ws.workspace.workspace_root())?;
    active_receipts_in(ws, &store).await
}
pub(crate) async fn query_receipts(
    ws: &WorkspaceSession<'_>,
    ids: Vec<crate::messages::RevId>,
) -> Result<Vec<crate::messages::splits::SplitOutcome>> {
    Ok(query_receipt_states(ws, ids)
        .await?
        .into_iter()
        .filter(|entry| entry.state == crate::messages::splits::SplitReceiptStatus::Active)
        .map(|entry| entry.outcome)
        .collect())
}

pub(crate) async fn query_receipt_states(
    ws: &WorkspaceSession<'_>,
    ids: Vec<crate::messages::RevId>,
) -> Result<Vec<crate::messages::splits::SplitReceiptState>> {
    let store = SplitStore::for_repo(ws.workspace.repo_path(), ws.workspace.workspace_root())?;
    query_receipt_states_in(ws, ids, &store).await
}

pub(super) async fn query_receipt_states_in(
    ws: &WorkspaceSession<'_>,
    ids: Vec<crate::messages::RevId>,
    store: &SplitStore,
) -> Result<Vec<crate::messages::splits::SplitReceiptState>> {
    use crate::messages::splits::{SplitReceiptState, SplitReceiptStatus};
    let active: std::collections::HashSet<_> = active_receipts_in(ws, store)
        .await?
        .into_iter()
        .map(|receipt| receipt.id)
        .collect();
    let operation = ws.repo().operation().id().hex();
    Ok(store
        .list()?
        .into_iter()
        .filter(|receipt| {
            ids.iter().any(|id| {
                id.change.hex == receipt.source.change.hex
                    && id.commit.hex == receipt.source.commit.hex
            })
        })
        .map(|receipt| SplitReceiptState {
            receipt_id: receipt.id.clone(),
            source: receipt.source.clone(),
            state: if active.contains(&receipt.id) {
                SplitReceiptStatus::Active
            } else {
                SplitReceiptStatus::Inactive
            },
            outcome: receipt.outcome(operation.clone()),
        })
        .collect())
}

pub(super) async fn active_receipts_in(
    ws: &WorkspaceSession<'_>,
    store: &SplitStore,
) -> Result<Vec<SplitReceipt>> {
    let mut active = Vec::new();
    for receipt in store.list()? {
        let mut valid = true;
        for id in [&receipt.selected, &receipt.remainder] {
            if !id.change.hex.bytes().all(|byte| byte.is_ascii_lowercase()) {
                valid = false;
                break;
            }
            let revset = ws.evaluate_revset_str(&format!("change_id({})", id.change.hex))?;
            let current = revset
                .stream()
                .commits(ws.repo().store())
                .try_collect::<Vec<_>>()
                .await?;
            if current.len() != 1 || current[0].id().hex() == receipt.source.commit.hex {
                valid = false;
                break;
            }
            // visibility alone is insufficient after an undo followed by a different rewrite.
            let mut evolution =
                jj_lib::evolution::walk_predecessors(ws.repo(), &[current[0].id().clone()])
                    .boxed_local();
            let mut retained = false;
            while let Some(entry) = evolution.try_next().await? {
                if entry.commit.id().hex() == id.commit.hex {
                    retained = true;
                    break;
                }
            }
            if !retained {
                valid = false;
                break;
            }
        }
        if valid {
            active.push(receipt);
        }
    }
    Ok(active)
}

#[async_trait(?Send)]
impl Mutation for SplitRevision {
    async fn execute(
        self: Box<Self>,
        ws: &mut WorkspaceSession,
        options: &MutationOptions,
    ) -> Result<MutationResult> {
        let store = SplitStore::for_repo(ws.workspace.repo_path(), ws.workspace.workspace_root())?;
        split(ws, *self, options, &store).await
    }
}
pub(super) async fn split(
    ws: &mut WorkspaceSession<'_>,
    request: SplitRevision,
    options: &MutationOptions,
    store: &SplitStore,
) -> Result<MutationResult> {
    ws.load_at_head().await?;
    let mut tx = ws.start_transaction().await?;
    if ws.repo().operation().id().hex() != request.operation_id {
        precondition!("The repository changed. Reopen the split dialog.");
    }
    let id = CommitId::try_from_hex(&request.source.commit.hex)
        .ok_or_else(|| anyhow!("Invalid split commit ID"))?;
    let source = ws.get_commit(&id)?;
    if source.change_id().reverse_hex() != request.source.change.hex {
        precondition!("The source does not match this change.");
    }
    if ws.check_immutable([id.clone()])? && !options.ignore_immutable {
        precondition!("Immutable revisions are protected");
    }
    let current = ws
        .evaluate_revset_str(&format!("change_id({})", source.change_id().reverse_hex()))?
        .stream()
        .commits(ws.repo().store())
        .try_collect::<Vec<_>>()
        .await?;
    if current.len() != 1 || current[0].id() != source.id() {
        precondition!("The source changed or diverged. Reopen the split dialog.");
    }
    if source.has_conflict() {
        precondition!("Resolve conflicts before splitting this change.");
    }
    let parents = source.parents().await?;
    let base = rewrite::merge_commit_trees(tx.repo(), &parents).await?;
    let tree = source.tree();
    let entries = base
        .diff_stream(&tree, &EverythingMatcher)
        .collect::<Vec<_>>()
        .await;
    for entry in &entries {
        if let Err(error) = &entry.values {
            return Err(anyhow!(error.to_string()));
        }
    }
    let paths = request
        .paths
        .iter()
        .map(|path| RepoPath::from_internal_string(path))
        .collect::<Result<Vec<_>, _>>()?;
    let selected: std::collections::HashSet<_> = request.paths.iter().cloned().collect();
    if selected.is_empty()
        || selected.len() != request.paths.len()
        || selected.len() >= entries.len()
        || selected.iter().any(|path| {
            !entries
                .iter()
                .any(|entry| entry.path.as_internal_file_string() == path)
        })
    {
        precondition!("Select some, but not all, changed files.");
    }
    let selected_tree = rewrite::restore_tree(
        &tree,
        &base,
        source.conflict_label(),
        conflict_label_for_commits(&parents),
        &FilesMatcher::new(paths),
    )
    .await?;
    let first = tx
        .repo_mut()
        .rewrite_commit(&source)
        .set_tree(selected_tree)
        .set_description(request.selected_description)
        .write()
        .await?;
    let second = tx
        .repo_mut()
        .rewrite_commit(&source)
        .clear_rewrite_source()
        .generate_new_change_id()
        .set_parents(vec![first.id().clone()])
        .set_tree(tree)
        .set_description(request.remainder_description)
        .write()
        .await?;
    if ws
        .data
        .workspace_settings
        .get_bool("split.legacy-bookmark-behavior")
        .unwrap_or(false)
    {
        tx.repo_mut()
            .set_rewritten_commit(source.id().clone(), second.id().clone());
    }
    tx.repo_mut()
        .transform_descendants(vec![source.id().clone()], async |mut rewriter| {
            rewriter.replace_parent(first.id(), [second.id()]);
            rewriter.rebase().await?.write().await?;
            Ok(())
        })
        .await?;
    for (name, wc) in tx.base_repo().clone().view().wc_commit_ids() {
        if wc == source.id() {
            tx.repo_mut().edit(name.clone(), &second).await?;
        }
    }
    let receipt = SplitReceipt {
        version: 1,
        id: uuid::Uuid::new_v4().simple().to_string(),
        created_at: Utc::now(),
        source_operation: request.operation_id,
        source: ws.format_id(&source),
        selected: ws.format_id(&first),
        remainder: ws.format_id(&second),
        ownership: entries
            .into_iter()
            .map(|entry| {
                let path = entry.path.as_internal_file_string().to_owned();
                SplitOwnership {
                    owner: if selected.contains(&path) {
                        SplitOwner::Selected
                    } else {
                        SplitOwner::Remainder
                    },
                    path,
                }
            })
            .collect(),
    };
    // write-ahead receipt: failed transactions leave an inactive record, never a lost ownership map.
    store.save(&receipt)?;
    match ws
        .finish_transaction(tx, format!("split commit {}", source.id().hex()))
        .await?
    {
        Some(new_status) => Ok(MutationResult::Split {
            new_status,
            new_selection: ws.format_header(&second, Some(false))?,
            outcome: receipt.outcome(ws.repo().operation().id().hex()),
        }),
        None => Ok(MutationResult::Unchanged),
    }
}

pub(super) fn project_events(
    events: Vec<crate::review::ReviewEvent>,
    receipts: &[SplitReceipt],
) -> std::collections::BTreeMap<String, crate::review::ChangeMarks> {
    let mut marks = std::collections::BTreeMap::new();
    let mut remaining = receipts.iter().peekable();
    for event in events {
        while remaining
            .peek()
            .is_some_and(|receipt| receipt.created_at <= event.at)
        {
            project_receipt(&mut marks, remaining.next().unwrap());
        }
        crate::review::apply_event(&mut marks, event);
    }
    for receipt in remaining {
        project_receipt(&mut marks, receipt);
    }
    marks.retain(|_, mark| mark.whole.is_some() || !mark.files.is_empty());
    marks
}

fn project_receipt(
    marks: &mut std::collections::BTreeMap<String, crate::review::ChangeMarks>,
    receipt: &SplitReceipt,
) {
    let Some(mut source) = marks.remove(&receipt.source.change.hex) else {
        return;
    };
    source.whole = None;
    let mut kept = std::collections::BTreeMap::new();
    for (path, mut mark) in source.files {
        let owner = receipt
            .ownership
            .iter()
            .find(|entry| entry.path == path)
            .map(|entry| match entry.owner {
                SplitOwner::Selected => &receipt.selected,
                SplitOwner::Remainder => &receipt.remainder,
            });
        if let Some(owner) = owner.filter(|owner| owner.change.hex != receipt.source.change.hex) {
            mark.origin_change_id
                .get_or_insert_with(|| receipt.source.change.hex.clone());
            marks
                .entry(owner.change.hex.clone())
                .or_default()
                .files
                .insert(path, mark);
        } else {
            kept.insert(path, mark);
        }
    }
    source.files = kept;
    marks.insert(receipt.source.change.hex.clone(), source);
}

pub(crate) async fn follows_owner(
    ws: &WorkspaceSession<'_>,
    from: &crate::messages::RevId,
    to: &crate::messages::RevId,
    path: &str,
) -> Result<bool> {
    let mut owner = from.change.hex.clone();
    let mut proven = false;
    for receipt in active_receipts(ws).await? {
        if receipt.source.change.hex != owner {
            continue;
        }
        if !proven {
            let id = CommitId::try_from_hex(&receipt.source.commit.hex)
                .ok_or_else(|| anyhow!("Invalid split source"))?;
            let mut evolution =
                jj_lib::evolution::walk_predecessors(ws.repo(), &[id]).boxed_local();
            while let Some(entry) = evolution.try_next().await? {
                if entry.commit.id().hex() == from.commit.hex {
                    proven = true;
                    break;
                }
            }
            if !proven {
                continue;
            }
        }
        if let Some(entry) = receipt.ownership.iter().find(|entry| entry.path == path) {
            owner = match entry.owner {
                SplitOwner::Selected => receipt.selected.change.hex,
                SplitOwner::Remainder => receipt.remainder.change.hex,
            };
        }
    }
    Ok(proven && owner == to.change.hex)
}
