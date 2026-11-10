use anyhow::Result;
use jj_lib::object_id::ObjectId as _;

use super::{get_by_chid, mkrepo, revs};
use crate::{
    messages::{RevSet, mutations::DescribeRevision, queries::RevisionSummaryResult},
    worker::{Mutation as _, WorkerSession, history, queries},
};

#[tokio::test]
async fn evolution_retains_exact_rewrites_and_old_patches() -> Result<()> {
    let directory = mkrepo();
    let mut session = WorkerSession::default();
    let mut ws = session.load_workspace(directory.path()).await?;
    let original = revs::working_copy();
    for description in ["First implementation", "Refined implementation"] {
        DescribeRevision {
            id: original.clone(),
            new_description: description.into(),
            reset_author: false,
        }
        .execute_unboxed(&mut ws)
        .await?;
    }
    let current = get_by_chid(&ws, &original)?;
    let id = ws.format_id(&current);
    let operation_before = ws.repo().operation().id().clone();
    let page = history::evolution_page(&ws, id.clone(), 0).await?;
    assert!(!page.has_more);
    assert!(page.entries.len() >= 3);
    assert_eq!(page.entries[0].revision.id.commit.hex, id.commit.hex);
    assert_eq!(
        page.entries[0].revision.description.lines[0],
        "Refined implementation"
    );
    let first = page
        .entries
        .iter()
        .find(|entry| entry.revision.description.lines[0] == "First implementation")
        .expect("previous rewrite");
    assert_eq!(first.revision.id.change.hex, id.change.hex);
    assert_ne!(first.revision.id.commit.hex, id.commit.hex);
    assert!(
        page.entries[0]
            .predecessor_ids
            .contains(&first.revision.id.commit.hex)
    );
    assert!(page.entries[0].operation.is_some());
    let summary =
        queries::query_revision_summary(&ws, RevSet::singleton(first.revision.id.clone())).await?;
    assert!(matches!(summary, RevisionSummaryResult::Detail { .. }));
    assert_eq!(ws.repo().operation().id(), &operation_before);
    let tail = history::evolution_page(&ws, id, 1).await?;
    assert_eq!(
        tail.entries[0].revision.id.commit.hex,
        page.entries[1].revision.id.commit.hex
    );
    Ok(())
}

#[tokio::test]
async fn operation_state_uses_historical_workspaces_without_checking_out() -> Result<()> {
    let directory = mkrepo();
    let mut session = WorkerSession::default();
    let mut ws = session.load_workspace(directory.path()).await?;
    let before = history::operation_page(&ws, None, 0).await?;
    ws.add_workspace("new-workspace".into(), directory.path().join("other"))
        .await?;
    let after = history::operation_page(&ws, None, 0).await?;
    assert_ne!(before.head_id, after.head_id);
    let operation_before = ws.repo().operation().id().clone();
    let wc_before = ws.repo().view().wc_commit_ids().clone();
    let old = history::operation_detail(&ws, before.head_id.clone()).await?;
    let new = history::operation_detail(&ws, after.head_id.clone()).await?;
    assert!(
        !old.workspaces
            .iter()
            .any(|workspace| workspace.name == "new-workspace")
    );
    assert!(
        new.workspaces
            .iter()
            .any(|workspace| workspace.name == "new-workspace")
    );
    assert!(!old.bookmarks.is_empty());
    assert!(!old.revisions.is_empty());
    assert_eq!(old.operation.id, before.head_id);
    assert_eq!(ws.repo().operation().id(), &operation_before);
    assert_eq!(ws.repo().view().wc_commit_ids(), &wc_before);
    Ok(())
}

#[tokio::test]
async fn operation_pages_stay_anchored_when_the_repository_changes() -> Result<()> {
    let directory = mkrepo();
    let mut session = WorkerSession::default();
    let mut ws = session.load_workspace(directory.path()).await?;
    for index in 0..43 {
        DescribeRevision {
            id: revs::working_copy(),
            new_description: format!("Version {index}"),
            reset_author: false,
        }
        .execute_unboxed(&mut ws)
        .await?;
    }
    let first = history::operation_page(&ws, None, 0).await?;
    assert_eq!(first.entries.len(), 40);
    assert!(first.has_more);
    DescribeRevision {
        id: revs::working_copy(),
        new_description: "Another version".into(),
        reset_author: false,
    }
    .execute_unboxed(&mut ws)
    .await?;
    let second = history::operation_page(&ws, Some(first.head_id.clone()), 40).await?;
    assert_eq!(second.head_id, first.head_id);
    assert!(!second.entries.is_empty());
    assert!(
        second
            .entries
            .iter()
            .all(|entry| !first.entries.iter().any(|old| old.id == entry.id))
    );
    assert!(
        first
            .entries
            .last()
            .unwrap()
            .parent_ids
            .contains(&second.entries[0].id)
    );
    Ok(())
}

#[tokio::test]
async fn history_rejects_invalid_or_mismatched_identifiers() -> Result<()> {
    let directory = mkrepo();
    let mut session = WorkerSession::default();
    let ws = session.load_workspace(directory.path()).await?;
    let mut wrong = revs::working_copy();
    wrong.commit.hex = "invalid".into();
    assert!(history::evolution_page(&ws, wrong, 0).await.is_err());
    let mut wrong = revs::working_copy();
    wrong.change.hex = "wrong".into();
    assert!(history::evolution_page(&ws, wrong, 0).await.is_err());
    assert!(
        history::operation_detail(&ws, "invalid".into())
            .await
            .is_err()
    );
    let head = ws.repo().operation().id().hex();
    assert!(
        history::operation_page(&ws, Some(head), usize::MAX)
            .await?
            .entries
            .is_empty()
    );
    Ok(())
}

#[tokio::test]
async fn revision_tree_lists_every_file_once() -> Result<()> {
    let directory = mkrepo();
    let mut session = WorkerSession::default();
    let ws = session.load_workspace(directory.path()).await?;

    let tree = history::revision_tree(&ws, full(&ws, revs::main_bookmark())?)?;
    assert!(!tree.truncated);
    assert!(tree.files.contains(&"a.txt".to_owned()));
    assert!(tree.files.windows(2).all(|pair| pair[0] < pair[1]));

    let conflicted = history::revision_tree(&ws, full(&ws, revs::conflict_bookmark())?)?;
    assert_eq!(conflicted.files.iter().filter(|f| *f == "b.txt").count(), 1);

    let mut wrong = full(&ws, revs::main_bookmark())?;
    wrong.change.hex = full(&ws, revs::working_copy())?.change.hex;
    assert!(history::revision_tree(&ws, wrong).is_err());
    Ok(())
}

fn full(
    ws: &crate::worker::WorkspaceSession,
    id: crate::messages::RevId,
) -> Result<crate::messages::RevId> {
    Ok(ws.format_id(&get_by_chid(ws, &id)?))
}
