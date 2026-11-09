use super::mkrepo;
use crate::{
    messages::{
        mutations::{MutationOptions, MutationResult, RedoOperation, UndoOperation},
        review::ReviewPerson,
        splits::{SplitOwner, SplitReceiptStatus, SplitRevision},
    },
    review::{FileFingerprint, ReviewEvent, ReviewStore},
    splits::SplitStore,
    worker::{Mutation as _, WorkerSession, splits},
};
use anyhow::Result;
use jj_lib::{object_id::ObjectId as _, repo::Repo as _};

#[tokio::test]
async fn split_keeps_identity_tree_and_receipt_through_undo_redo() -> Result<()> {
    let directory = mkrepo();
    let receipts = tempfile::tempdir()?;
    let store = SplitStore::at(receipts.path().to_owned());
    let mut session = WorkerSession::default();
    let mut ws = session.load_workspace(directory.path()).await?;
    std::fs::write(directory.path().join("first.txt"), "first\n")?;
    std::fs::write(directory.path().join("second.txt"), "second\n")?;
    ws.import_and_snapshot(true, false).await?;
    let source = ws.get_commit(ws.wc_id())?;
    let original_op = ws.repo().operation().id().hex();
    let request = SplitRevision {
        source: ws.format_id(&source),
        operation_id: original_op.clone(),
        paths: vec!["first.txt".into()],
        selected_description: "first part".into(),
        remainder_description: "remaining part".into(),
    };
    let MutationResult::Split { outcome, .. } =
        splits::split(&mut ws, request, &MutationOptions::default(), &store).await?
    else {
        panic!("split expected")
    };
    let first = ws.get_commit(
        &jj_lib::backend::CommitId::try_from_hex(&outcome.selected.commit.hex).unwrap(),
    )?;
    let second = ws.get_commit(
        &jj_lib::backend::CommitId::try_from_hex(&outcome.remainder.commit.hex).unwrap(),
    )?;
    assert_eq!(first.change_id(), source.change_id());
    assert_ne!(second.change_id(), source.change_id());
    assert_eq!(second.parent_ids(), &[first.id().clone()]);
    assert_eq!(second.tree_ids(), source.tree_ids());
    assert_eq!(ws.wc_id(), second.id());
    assert_eq!(first.description(), "first part");
    assert_eq!(second.description(), "remaining part");
    assert_eq!(
        outcome
            .ownership
            .iter()
            .find(|item| item.path == "first.txt")
            .unwrap()
            .owner,
        SplitOwner::Selected
    );
    assert_eq!(splits::active_receipts_in(&ws, &store).await?.len(), 1);
    let states = splits::query_receipt_states_in(&ws, vec![outcome.source.clone()], &store).await?;
    assert_eq!(states[0].state, SplitReceiptStatus::Active);
    assert!(
        splits::query_receipt_states_in(&ws, vec![outcome.selected.clone()], &store)
            .await?
            .is_empty()
    );
    UndoOperation.execute_unboxed(&mut ws).await?;
    assert_eq!(ws.wc_id(), source.id());
    assert!(splits::active_receipts_in(&ws, &store).await?.is_empty());
    assert_eq!(
        splits::query_receipt_states_in(&ws, vec![outcome.source.clone()], &store).await?[0].state,
        SplitReceiptStatus::Inactive
    );
    RedoOperation.execute_unboxed(&mut ws).await?;
    assert_eq!(ws.wc_id(), second.id());
    assert_eq!(splits::active_receipts_in(&ws, &store).await?.len(), 1);
    assert_eq!(store.list()?.len(), 1);
    Ok(())
}

#[tokio::test]
async fn rejects_stale_and_invalid_selection_without_writing_receipt() -> Result<()> {
    let directory = mkrepo();
    let receipts = tempfile::tempdir()?;
    let store = SplitStore::at(receipts.path().to_owned());
    let mut session = WorkerSession::default();
    let mut ws = session.load_workspace(directory.path()).await?;
    std::fs::write(directory.path().join("first.txt"), "first\n")?;
    std::fs::write(directory.path().join("second.txt"), "second\n")?;
    ws.import_and_snapshot(true, false).await?;
    let source = ws.get_commit(ws.wc_id())?;
    let operation = ws.repo().operation().id().hex();
    let base = SplitRevision {
        source: ws.format_id(&source),
        operation_id: operation.clone(),
        paths: vec!["first.txt".into()],
        selected_description: "one".into(),
        remainder_description: "two".into(),
    };
    let mut stale = base.clone();
    stale.operation_id = "stale".into();
    assert!(matches!(
        splits::split(&mut ws, stale, &MutationOptions::default(), &store).await?,
        MutationResult::PreconditionError { .. }
    ));
    for paths in [
        vec![],
        vec!["first.txt", "second.txt"],
        vec!["missing.txt"],
        vec!["first.txt", "first.txt"],
    ] {
        let mut request = base.clone();
        request.paths = paths.into_iter().map(str::to_owned).collect();
        assert!(matches!(
            splits::split(&mut ws, request, &MutationOptions::default(), &store).await?,
            MutationResult::PreconditionError { .. }
        ));
    }
    assert_eq!(ws.repo().operation().id().hex(), operation);
    assert_eq!(ws.wc_id(), source.id());
    assert!(store.list()?.is_empty());
    Ok(())
}

#[tokio::test]
async fn write_failure_aborts_transaction() -> Result<()> {
    let directory = mkrepo();
    let receipts = tempfile::NamedTempFile::new()?;
    let store = SplitStore::at(receipts.path().to_owned());
    let mut session = WorkerSession::default();
    let mut ws = session.load_workspace(directory.path()).await?;
    std::fs::write(directory.path().join("first.txt"), "first\n")?;
    std::fs::write(directory.path().join("second.txt"), "second\n")?;
    ws.import_and_snapshot(true, false).await?;
    let source = ws.get_commit(ws.wc_id())?;
    let operation = ws.repo().operation().id().hex();
    let request = SplitRevision {
        source: ws.format_id(&source),
        operation_id: operation.clone(),
        paths: vec!["first.txt".into()],
        selected_description: "one".into(),
        remainder_description: "two".into(),
    };
    assert!(
        splits::split(&mut ws, request, &MutationOptions::default(), &store)
            .await
            .is_err()
    );
    assert_eq!(ws.repo().operation().id().hex(), operation);
    assert_eq!(ws.wc_id(), source.id());
    Ok(())
}

#[tokio::test]
async fn receipt_projects_original_reviews_and_later_actions_in_order() -> Result<()> {
    let directory = mkrepo();
    let receipts = tempfile::tempdir()?;
    let store = SplitStore::at(receipts.path().to_owned());
    let mut session = WorkerSession::default();
    let mut ws = session.load_workspace(directory.path()).await?;
    std::fs::write(directory.path().join("first.txt"), "first\n")?;
    std::fs::write(directory.path().join("second.txt"), "second\n")?;
    ws.import_and_snapshot(true, false).await?;
    let source = ws.get_commit(ws.wc_id())?;
    let id = ws.format_id(&source);
    let reviews_dir = tempfile::tempdir()?;
    let reviews = ReviewStore::at(reviews_dir.path().to_owned());
    let person = ReviewPerson {
        name: "Reviewer".into(),
        email: "reviewer@example.test".into(),
    };
    let original = ReviewEvent {
        version: 1,
        id: String::new(),
        at: chrono::Utc::now(),
        person: person.clone(),
        change_id: id.change.hex.clone(),
        commit_id: id.commit.hex.clone(),
        path: None,
        reviewed: true,
        files: vec![
            FileFingerprint {
                path: "first.txt".into(),
                hash: "first".into(),
            },
            FileFingerprint {
                path: "second.txt".into(),
                hash: "second".into(),
            },
        ],
    };
    reviews.append(original.clone())?;
    let request = SplitRevision {
        source: id.clone(),
        operation_id: ws.repo().operation().id().hex(),
        paths: vec!["first.txt".into()],
        selected_description: "one".into(),
        remainder_description: "two".into(),
    };
    let MutationResult::Split { outcome, .. } =
        splits::split(&mut ws, request, &MutationOptions::default(), &store).await?
    else {
        panic!("split expected")
    };
    let active = splits::active_receipts_in(&ws, &store).await?;
    let projected = splits::project_events(reviews.events(&person)?, &active);
    let moved = &projected[&outcome.remainder.change.hex].files["second.txt"];
    assert_eq!(moved.commit_id, id.commit.hex);
    assert_eq!(moved.at, original.at);
    assert_eq!(
        moved.origin_change_id.as_deref(),
        Some(id.change.hex.as_str())
    );
    assert!(projected[&id.change.hex].whole.is_none());
    // clearing the selected change later does not erase the child review.
    reviews.append(ReviewEvent {
        at: chrono::Utc::now(),
        reviewed: false,
        files: vec![],
        ..original.clone()
    })?;
    let projected = splits::project_events(reviews.events(&person)?, &active);
    assert!(!projected.contains_key(&id.change.hex));
    assert!(
        projected[&outcome.remainder.change.hex]
            .files
            .contains_key("second.txt")
    );
    reviews.append(ReviewEvent {
        at: chrono::Utc::now(),
        change_id: outcome.remainder.change.hex.clone(),
        commit_id: outcome.remainder.commit.hex,
        path: Some("second.txt".into()),
        reviewed: false,
        files: vec![],
        ..original
    })?;
    assert!(splits::project_events(reviews.events(&person)?, &active).is_empty());
    Ok(())
}

#[tokio::test]
async fn rejects_immutable_and_rewritten_sources() -> Result<()> {
    let directory = mkrepo();
    let receipts = tempfile::tempdir()?;
    let store = SplitStore::at(receipts.path().to_owned());
    let mut session = WorkerSession::default();
    let mut ws = session.load_workspace(directory.path()).await?;
    let immutable = ws.get_commit(ws.repo().store().root_commit_id())?;
    let immutable_request = SplitRevision {
        source: ws.format_id(&immutable),
        operation_id: ws.repo().operation().id().hex(),
        paths: vec!["c.txt".into()],
        selected_description: "one".into(),
        remainder_description: "two".into(),
    };
    assert!(
        matches!(splits::split(&mut ws, immutable_request, &MutationOptions::default(), &store).await?, MutationResult::PreconditionError{message} if message.contains("Immutable"))
    );
    std::fs::write(directory.path().join("first.txt"), "first\n")?;
    std::fs::write(directory.path().join("second.txt"), "second\n")?;
    ws.import_and_snapshot(true, false).await?;
    let source = ws.get_commit(ws.wc_id())?;
    let id = ws.format_id(&source);
    crate::messages::mutations::DescribeRevision {
        id: id.clone(),
        new_description: "new description".into(),
        reset_author: false,
    }
    .execute_unboxed(&mut ws)
    .await?;
    let request = SplitRevision {
        source: id,
        operation_id: ws.repo().operation().id().hex(),
        paths: vec!["first.txt".into()],
        selected_description: "one".into(),
        remainder_description: "two".into(),
    };
    assert!(
        matches!(splits::split(&mut ws, request, &MutationOptions::default(), &store).await?, MutationResult::PreconditionError{message} if message.contains("changed or diverged"))
    );
    assert!(store.list()?.is_empty());
    Ok(())
}

#[tokio::test]
async fn split_rebases_descendant_without_changing_its_tree() -> Result<()> {
    let directory = mkrepo();
    let receipts = tempfile::tempdir()?;
    let store = SplitStore::at(receipts.path().to_owned());
    let mut session = WorkerSession::default();
    let mut ws = session.load_workspace(directory.path()).await?;
    std::fs::write(directory.path().join("first.txt"), "first\n")?;
    std::fs::write(directory.path().join("second.txt"), "second\n")?;
    ws.import_and_snapshot(true, false).await?;
    let source = ws.get_commit(ws.wc_id())?;
    let id = ws.format_id(&source);
    crate::messages::mutations::CreateRevision {
        set: crate::messages::RevSet::singleton(id.clone()),
    }
    .execute_unboxed(&mut ws)
    .await?;
    std::fs::write(directory.path().join("child.txt"), "child\n")?;
    ws.import_and_snapshot(true, false).await?;
    let child = ws.get_commit(ws.wc_id())?;
    let request = SplitRevision {
        source: id,
        operation_id: ws.repo().operation().id().hex(),
        paths: vec!["first.txt".into()],
        selected_description: "one".into(),
        remainder_description: "two".into(),
    };
    let MutationResult::Split { outcome, .. } =
        splits::split(&mut ws, request, &MutationOptions::default(), &store).await?
    else {
        panic!("split expected")
    };
    let current_child = ws.get_commit(ws.wc_id())?;
    assert_eq!(child.change_id(), current_child.change_id());
    assert_eq!(child.tree_ids(), current_child.tree_ids());
    assert_eq!(
        current_child.parent_ids()[0].hex(),
        outcome.remainder.commit.hex
    );
    Ok(())
}
