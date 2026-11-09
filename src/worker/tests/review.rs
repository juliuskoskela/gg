use anyhow::Result;
use jj_lib::object_id::ObjectId as _;

use super::{mkrepo, revs};
use crate::{
    messages::{
        mutations::{AbandonRevisions, DescribeRevision},
        review::{ReviewRequest, ReviewState},
    },
    review::ReviewStore,
    worker::{Mutation as _, WorkerSession, review},
};

#[tokio::test]
async fn reviewed_files_survive_description_rewrites_and_detect_edits_and_removal() -> Result<()> {
    let data = tempfile::tempdir()?;
    let store = ReviewStore::at(data.path().to_owned());
    let directory = mkrepo();
    let mut session = WorkerSession::default();
    let mut ws = session.load_workspace(directory.path()).await?;
    std::fs::write(directory.path().join("review.txt"), "review me\n")?;
    ws.import_and_snapshot(true, false).await?;
    let commit = ws.get_commit(ws.wc_id())?;
    let id = ws.format_header(&commit, None)?.id;
    let marked = review::handle_with_store(
        &ws,
        ReviewRequest::Set {
            id: id.clone(),
            path: Some("review.txt".into()),
            reviewed: true,
        },
        &store,
    )
    .await?;
    assert_eq!(marked.changes[0].files[0].state, ReviewState::Reviewed);
    let original = commit.id().hex();
    DescribeRevision {
        id: revs::working_copy(),
        new_description: "rewrite metadata".into(),
        reset_author: false,
    }
    .execute_unboxed(&mut ws)
    .await?;
    let same = review::handle_with_store(&ws, ReviewRequest::List, &store).await?;
    assert_eq!(same.changes[0].files[0].reviewed_commit_id, original);
    assert_eq!(same.changes[0].files[0].state, ReviewState::Reviewed);
    std::fs::write(directory.path().join("review.txt"), "changed contents\n")?;
    ws.import_and_snapshot(true, false).await?;
    let changed = review::handle_with_store(&ws, ReviewRequest::List, &store).await?;
    assert_eq!(changed.changes[0].files[0].state, ReviewState::Changed);
    std::fs::remove_file(directory.path().join("review.txt"))?;
    ws.import_and_snapshot(true, false).await?;
    let gone = review::handle_with_store(&ws, ReviewRequest::List, &store).await?;
    assert_eq!(gone.changes[0].files[0].state, ReviewState::Gone);
    let current = ws.get_commit(ws.wc_id())?;
    let current_id = ws.format_header(&current, None)?.id;
    AbandonRevisions {
        set: crate::messages::RevSet {
            from: current_id.clone(),
            to: current_id,
        },
    }
    .execute_unboxed(&mut ws)
    .await?;
    let abandoned = review::handle_with_store(&ws, ReviewRequest::List, &store).await?;
    assert_eq!(abandoned.changes[0].state, ReviewState::Gone);
    Ok(())
}

#[tokio::test]
async fn whole_change_counts_only_current_files_and_new_files_are_unreviewed() -> Result<()> {
    let data = tempfile::tempdir()?;
    let store = ReviewStore::at(data.path().to_owned());
    let directory = mkrepo();
    let mut session = WorkerSession::default();
    let mut ws = session.load_workspace(directory.path()).await?;
    std::fs::write(directory.path().join("review-first.txt"), "first\n")?;
    ws.import_and_snapshot(true, false).await?;
    let commit = ws.get_commit(ws.wc_id())?;
    let id = ws.format_header(&commit, None)?.id;
    let marked = review::handle_with_store(
        &ws,
        ReviewRequest::Set {
            id,
            path: None,
            reviewed: true,
        },
        &store,
    )
    .await?;
    assert_eq!(marked.changes[0].state, ReviewState::Reviewed);
    assert_eq!(marked.changes[0].total, marked.changes[0].reviewed);
    DescribeRevision {
        id: revs::working_copy(),
        new_description: "a different rationale".into(),
        reset_author: false,
    }
    .execute_unboxed(&mut ws)
    .await?;
    let changed_description = review::handle_with_store(&ws, ReviewRequest::List, &store).await?;
    assert_eq!(changed_description.changes[0].state, ReviewState::Changed);
    assert!(
        changed_description.changes[0]
            .files
            .iter()
            .all(|file| file.state == ReviewState::Reviewed)
    );
    std::fs::write(directory.path().join("review-second.txt"), "second\n")?;
    ws.import_and_snapshot(true, false).await?;
    let added = review::handle_with_store(&ws, ReviewRequest::List, &store).await?;
    assert_eq!(added.changes[0].state, ReviewState::Changed);
    assert_eq!(added.changes[0].reviewed + 1, added.changes[0].total);
    let commit = ws.get_commit(ws.wc_id())?;
    let id = ws.format_header(&commit, None)?.id;
    let cleared = review::handle_with_store(
        &ws,
        ReviewRequest::Set {
            id,
            path: None,
            reviewed: false,
        },
        &store,
    )
    .await?;
    assert!(cleared.changes.is_empty());
    Ok(())
}
