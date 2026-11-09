use std::collections::HashSet;

use anyhow::Result;
use async_trait::async_trait;
use futures_util::TryStreamExt;
use jj_lib::{commit::Commit, object_id::ObjectId as _, revset::RevsetExpression, rewrite};

use super::precondition;
use crate::{
    messages::{
        RevId,
        mutations::{
            AbandonSelectedRevisions, MutationOptions, MutationResult, RebaseSelectedRevisions,
        },
    },
    worker::{Mutation, gui_util::WorkspaceSession},
};

fn exact_commit(ws: &WorkspaceSession, id: &RevId) -> Result<Commit, String> {
    let commit = ws.resolve_change_id(id).map_err(|_| {
        "A selected revision changed or disappeared. Refresh and select it again.".to_string()
    })?;
    // the usual resolver accepts newer working-copy snapshots; confirmed selections must not.
    if commit.id().hex() != id.commit.hex || commit.change_id().reverse_hex() != id.change.hex {
        return Err("A selected revision changed. Refresh and select it again.".to_string());
    }
    Ok(commit)
}

fn exact_selection(ws: &WorkspaceSession, ids: &[RevId]) -> Result<Vec<Commit>, String> {
    if ids.is_empty() {
        return Err("Select at least one revision.".to_string());
    }
    let mut seen = HashSet::new();
    ids.iter()
        .map(|id| {
            let commit = exact_commit(ws, id)?;
            if !seen.insert(commit.id().clone()) {
                return Err("The selection contains a duplicate revision.".to_string());
            }
            Ok(commit)
        })
        .collect()
}

async fn affected(
    ws: &WorkspaceSession<'_>,
    commits: &[Commit],
) -> Result<Vec<jj_lib::backend::CommitId>> {
    let selected =
        RevsetExpression::commits(commits.iter().map(|commit| commit.id().clone()).collect());
    Ok(selected
        .descendants()
        .evaluate(ws.repo())?
        .stream()
        .try_collect()
        .await?)
}

#[async_trait(?Send)]
impl Mutation for AbandonSelectedRevisions {
    async fn execute(
        self: Box<Self>,
        ws: &mut WorkspaceSession,
        options: &MutationOptions,
    ) -> Result<MutationResult> {
        let mut tx = ws.start_transaction().await?;
        let commits = match exact_selection(ws, &self.ids) {
            Ok(commits) => commits,
            Err(reason) => precondition!("{reason}"),
        };
        if !options.ignore_immutable && ws.check_immutable(affected(ws, &commits).await?)? {
            precondition!("The selection or its descendants contain immutable revisions.");
        }
        for commit in &commits {
            tx.repo_mut().record_abandoned_commit(commit);
        }
        tx.repo_mut().rebase_descendants().await?;
        match ws
            .finish_transaction(tx, format!("abandon {} selected revisions", commits.len()))
            .await?
        {
            Some(new_status) => Ok(MutationResult::Updated {
                new_status,
                new_selection: None,
            }),
            None => Ok(MutationResult::Unchanged),
        }
    }
}

#[async_trait(?Send)]
impl Mutation for RebaseSelectedRevisions {
    async fn execute(
        self: Box<Self>,
        ws: &mut WorkspaceSession,
        options: &MutationOptions,
    ) -> Result<MutationResult> {
        let mut tx = ws.start_transaction().await?;
        let commits = match exact_selection(ws, &self.ids) {
            Ok(commits) => commits,
            Err(reason) => precondition!("{reason}"),
        };
        let affected = affected(ws, &commits).await?;
        if !options.ignore_immutable && ws.check_immutable(affected.clone())? {
            precondition!("The selection or its descendants contain immutable revisions.");
        }
        let destination = match exact_commit(ws, &self.destination) {
            Ok(commit) => commit,
            Err(_) => precondition!("The destination changed or disappeared. Choose it again."),
        };
        if affected.contains(destination.id()) {
            precondition!("Choose a destination outside the selection and its descendants.");
        }
        // explicit rewrites make selected ancestors and descendants siblings; unselected children follow their parents.
        for commit in &commits {
            if commit.parent_ids() == [destination.id().clone()] {
                continue;
            }
            rewrite::rebase_commit(
                tx.repo_mut(),
                commit.clone(),
                vec![destination.id().clone()],
            )
            .await?;
        }
        tx.repo_mut().rebase_descendants().await?;
        match ws
            .finish_transaction(
                tx,
                format!(
                    "rebase {} selected revisions independently onto {}",
                    commits.len(),
                    destination.id().hex()
                ),
            )
            .await?
        {
            Some(new_status) => Ok(MutationResult::Updated {
                new_status,
                new_selection: None,
            }),
            None => Ok(MutationResult::Unchanged),
        }
    }
}

#[cfg(all(test, not(feature = "ts-rs")))]
mod tests {
    use super::*;
    use crate::{
        messages::mutations::{DescribeRevision, UndoOperation},
        worker::{
            WorkerSession,
            tests::{get_by_chid, mkrepo, revs},
        },
    };

    fn exact(ws: &WorkspaceSession, id: RevId) -> RevId {
        ws.format_header(&get_by_chid(ws, &id).unwrap(), None)
            .unwrap()
            .id
    }

    #[tokio::test]
    async fn abandon_exact_selection_preserves_intervening_change_and_undo() -> Result<()> {
        let dir = mkrepo();
        let mut session = WorkerSession::default();
        let mut ws = session.load_workspace(dir.path()).await?;
        let first = exact(&ws, revs::hunk_base());
        let last = exact(&ws, revs::hunk_grandchild());
        let middle = get_by_chid(&ws, &revs::hunk_child_single())?;
        let result = AbandonSelectedRevisions {
            ids: vec![last.clone(), first.clone()],
        }
        .execute_unboxed(&mut ws)
        .await?;
        assert!(matches!(result, MutationResult::Updated { .. }));
        let after = get_by_chid(&ws, &revs::hunk_child_single())?;
        assert_eq!(after.change_id(), middle.change_id());
        assert_eq!(after.description(), middle.description());
        assert!(get_by_chid(&ws, &first).is_err());
        assert!(get_by_chid(&ws, &last).is_err());
        UndoOperation.execute_unboxed(&mut ws).await?;
        assert_eq!(get_by_chid(&ws, &first)?.id().hex(), first.commit.hex);
        assert_eq!(get_by_chid(&ws, &last)?.id().hex(), last.commit.hex);
        Ok(())
    }

    #[tokio::test]
    async fn rebase_selected_ancestor_and_descendant_become_siblings() -> Result<()> {
        let dir = mkrepo();
        let mut session = WorkerSession::default();
        let mut ws = session.load_workspace(dir.path()).await?;
        let first = exact(&ws, revs::hunk_base());
        let last = exact(&ws, revs::hunk_grandchild());
        let destination = exact(&ws, revs::small_parent());
        let middle_before = get_by_chid(&ws, &revs::hunk_child_single())?;
        let result = RebaseSelectedRevisions {
            ids: vec![last.clone(), first.clone()],
            destination: destination.clone(),
        }
        .execute_unboxed(&mut ws)
        .await?;
        assert!(matches!(result, MutationResult::Updated { .. }));
        let first_after = get_by_chid(&ws, &first)?;
        let last_after = get_by_chid(&ws, &last)?;
        assert_eq!(first_after.parent_ids()[0].hex(), destination.commit.hex);
        assert_eq!(last_after.parent_ids()[0].hex(), destination.commit.hex);
        let middle_after = get_by_chid(&ws, &revs::hunk_child_single())?;
        assert_eq!(middle_after.parent_ids(), &[first_after.id().clone()]);
        assert_eq!(middle_after.description(), middle_before.description());
        UndoOperation.execute_unboxed(&mut ws).await?;
        assert_eq!(get_by_chid(&ws, &first)?.id().hex(), first.commit.hex);
        assert_eq!(get_by_chid(&ws, &last)?.id().hex(), last.commit.hex);
        Ok(())
    }

    #[tokio::test]
    async fn preflight_rejects_stale_duplicate_and_immutable_without_partial_abandon() -> Result<()>
    {
        let dir = mkrepo();
        let mut session = WorkerSession::default();
        let mut ws = session.load_workspace(dir.path()).await?;
        let good = exact(&ws, revs::small_child());
        let protected = exact(&ws, revs::immutable_bookmark());
        for ids in [
            vec![good.clone(), good.clone()],
            vec![good.clone(), protected],
        ] {
            let result = AbandonSelectedRevisions { ids }
                .execute_unboxed(&mut ws)
                .await?;
            assert!(matches!(result, MutationResult::PreconditionError { .. }));
            assert_eq!(get_by_chid(&ws, &good)?.id().hex(), good.commit.hex);
        }
        let stale = exact(&ws, revs::hunk_grandchild());
        DescribeRevision {
            id: stale.clone(),
            new_description: "new description".into(),
            reset_author: false,
        }
        .execute_unboxed(&mut ws)
        .await?;
        let result = AbandonSelectedRevisions {
            ids: vec![good.clone(), stale],
        }
        .execute_unboxed(&mut ws)
        .await?;
        assert!(matches!(result, MutationResult::PreconditionError { .. }));
        assert_eq!(get_by_chid(&ws, &good)?.id().hex(), good.commit.hex);
        Ok(())
    }

    #[tokio::test]
    async fn rebase_rejects_descendant_and_stale_destination() -> Result<()> {
        let dir = mkrepo();
        let mut session = WorkerSession::default();
        let mut ws = session.load_workspace(dir.path()).await?;
        let source = exact(&ws, revs::hunk_base());
        let destination = exact(&ws, revs::hunk_grandchild());
        let result = RebaseSelectedRevisions {
            ids: vec![source.clone()],
            destination,
        }
        .execute_unboxed(&mut ws)
        .await?;
        assert!(matches!(result, MutationResult::PreconditionError { .. }));
        assert_eq!(get_by_chid(&ws, &source)?.id().hex(), source.commit.hex);
        let destination = exact(&ws, revs::small_child());
        DescribeRevision {
            id: destination.clone(),
            new_description: "changed destination".into(),
            reset_author: false,
        }
        .execute_unboxed(&mut ws)
        .await?;
        let result = RebaseSelectedRevisions {
            ids: vec![source.clone()],
            destination,
        }
        .execute_unboxed(&mut ws)
        .await?;
        assert!(matches!(result, MutationResult::PreconditionError { .. }));
        assert_eq!(get_by_chid(&ws, &source)?.id().hex(), source.commit.hex);
        Ok(())
    }
    #[tokio::test]
    async fn rejects_working_copy_changes_after_confirmation() -> Result<()> {
        let dir = mkrepo();
        let mut session = WorkerSession::default();
        let mut ws = session.load_workspace(dir.path()).await?;
        let before = ws.wc_id().clone();
        let id = ws.format_header(&ws.get_commit(&before)?, None)?.id;
        std::fs::write(dir.path().join("new-after-confirmation.txt"), "changed\n")?;
        let result = AbandonSelectedRevisions { ids: vec![id] }
            .execute_unboxed(&mut ws)
            .await?;
        assert!(matches!(result, MutationResult::PreconditionError { .. }));
        assert_ne!(ws.wc_id(), &before);
        assert!(dir.path().join("new-after-confirmation.txt").exists());
        Ok(())
    }
    #[tokio::test]
    async fn rebase_already_on_destination_is_unchanged() -> Result<()> {
        let dir = mkrepo();
        let mut session = WorkerSession::default();
        let mut ws = session.load_workspace(dir.path()).await?;
        let source = exact(&ws, revs::small_child());
        let destination = exact(&ws, revs::small_parent());
        let result = RebaseSelectedRevisions {
            ids: vec![source.clone()],
            destination,
        }
        .execute_unboxed(&mut ws)
        .await?;
        assert!(matches!(result, MutationResult::Unchanged));
        assert_eq!(get_by_chid(&ws, &source)?.id().hex(), source.commit.hex);
        Ok(())
    }
}
