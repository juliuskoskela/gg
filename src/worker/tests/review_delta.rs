use anyhow::Result;
use jj_lib::{
    backend::{CopyId, TreeValue},
    commit::Commit,
    merge::Merge,
    merged_tree::MergedTree,
    merged_tree_builder::MergedTreeBuilder,
    repo::Repo as _,
    repo_path::RepoPath,
};

use super::mkrepo;
use crate::{
    messages::review_delta::{ReviewDelta, ReviewDeltaRequest},
    worker::{WorkerSession, WorkspaceSession, review_delta},
};

async fn file(
    ws: &WorkspaceSession<'_>,
    tree: MergedTree,
    path: &str,
    data: &str,
) -> Result<MergedTree> {
    let path = RepoPath::from_internal_string(path)?;
    let id = ws
        .repo()
        .store()
        .write_file(path, &mut data.as_bytes())
        .await?;
    let mut builder = MergedTreeBuilder::new(tree);
    builder.set_or_remove(
        path.to_owned(),
        Merge::normal(TreeValue::File {
            id,
            executable: false,
            copy_id: CopyId::placeholder(),
        }),
    );
    Ok(builder.write_tree().await?)
}

fn request(ws: &WorkspaceSession<'_>, from: &Commit, to: &Commit) -> ReviewDeltaRequest {
    ReviewDeltaRequest {
        from: ws.format_id(from),
        to: ws.format_id(to),
        path: None,
        full_context: false,
    }
}

async fn versions(
    ws: &mut WorkspaceSession<'_>,
    edit: bool,
    conflict: bool,
) -> Result<(Commit, Commit)> {
    let original = ws.get_commit(ws.wc_id())?;
    let base_text = (0..30).map(|i| format!("line {i}\n")).collect::<String>();
    let reviewed_text = base_text.replace("line 20\n", "reviewed line\n");
    let base_tree = file(ws, original.tree(), "review.txt", &base_text).await?;
    let reviewed_tree = file(ws, base_tree.clone(), "review.txt", &reviewed_text).await?;
    let changed_base = if conflict {
        base_text.replace("line 20\n", "upstream conflicting line\n")
    } else {
        base_text.replace("line 1\n", "upstream context\n")
    };
    let changed_base_tree = file(ws, base_tree.clone(), "review.txt", &changed_base).await?;
    let final_text = if conflict {
        changed_base
    } else {
        changed_base.replace(
            "line 20\n",
            if edit {
                "refined line\n"
            } else {
                "reviewed line\n"
            },
        )
    };
    let final_tree = file(ws, changed_base_tree.clone(), "review.txt", &final_text).await?;
    let mut tx = ws.start_transaction().await?;
    let base = tx
        .repo_mut()
        .new_commit(original.parent_ids().to_vec(), base_tree)
        .write()
        .await?;
    let from = tx
        .repo_mut()
        .rewrite_commit(&original)
        .set_parents(vec![base.id().clone()])
        .set_tree(reviewed_tree)
        .set_description("reviewed version")
        .write()
        .await?;
    let new_base = tx
        .repo_mut()
        .rewrite_commit(&base)
        .set_tree(changed_base_tree)
        .write()
        .await?;
    let to = tx
        .repo_mut()
        .rewrite_commit(&from)
        .set_parents(vec![new_base.id().clone()])
        .set_tree(final_tree)
        .set_description("reviewed version")
        .write()
        .await?;
    ws.finish_transaction(tx, "make versions for comparison")
        .await?;
    Ok((from, to))
}

#[tokio::test]
async fn excludes_rebase_context_changes_in_the_same_file() -> Result<()> {
    let directory = mkrepo();
    let mut session = WorkerSession::default();
    let mut ws = session.load_workspace(directory.path()).await?;
    let (from, to) = versions(&mut ws, false, false).await?;
    let operation = ws.repo().operation().id().clone();
    let ReviewDelta::Ready {
        changes, rebased, ..
    } = review_delta::compare(&ws, request(&ws, &from, &to)).await?
    else {
        panic!("available");
    };
    assert!(rebased);
    assert!(changes.is_empty());
    assert_eq!(ws.repo().operation().id(), &operation);
    Ok(())
}

#[tokio::test]
async fn shows_author_edits_while_excluding_parent_edits() -> Result<()> {
    let directory = mkrepo();
    let mut session = WorkerSession::default();
    let mut ws = session.load_workspace(directory.path()).await?;
    let (from, to) = versions(&mut ws, true, false).await?;
    let ReviewDelta::Ready { changes, .. } =
        review_delta::compare(&ws, request(&ws, &from, &to)).await?
    else {
        panic!("available");
    };
    assert_eq!(changes.len(), 1);
    let text = changes[0]
        .hunks
        .iter()
        .flat_map(|h| &h.lines.lines)
        .cloned()
        .collect::<String>();
    assert!(text.contains("-reviewed line"));
    assert!(text.contains("+refined line"));
    assert!(!text.contains("upstream context"));
    let mut other = request(&ws, &from, &to);
    other.path = Some("other.txt".into());
    assert!(
        matches!(review_delta::compare(&ws, other).await?, ReviewDelta::Ready { changes, .. } if changes.is_empty())
    );
    Ok(())
}

#[tokio::test]
async fn reports_an_ambiguous_rebase_instead_of_an_author_diff() -> Result<()> {
    let directory = mkrepo();
    let mut session = WorkerSession::default();
    let mut ws = session.load_workspace(directory.path()).await?;
    let (from, to) = versions(&mut ws, false, true).await?;
    assert!(matches!(
        review_delta::compare(&ws, request(&ws, &from, &to)).await?,
        ReviewDelta::Unavailable { .. }
    ));
    Ok(())
}

#[tokio::test]
async fn validates_exact_versions_and_preserves_description_changes() -> Result<()> {
    let directory = mkrepo();
    let mut session = WorkerSession::default();
    let mut ws = session.load_workspace(directory.path()).await?;
    let from = ws.get_commit(ws.wc_id())?;
    let mut tx = ws.start_transaction().await?;
    let to = tx
        .repo_mut()
        .rewrite_commit(&from)
        .set_description("new explanation")
        .write()
        .await?;
    ws.finish_transaction(tx, "edit description").await?;
    assert!(
        matches!(review_delta::compare(&ws, request(&ws, &from, &to)).await?, ReviewDelta::Ready { changes, description_after, .. } if changes.is_empty() && description_after == "new explanation")
    );
    let mut wrong = request(&ws, &from, &to);
    wrong.from.change.hex = "wrong".into();
    assert!(matches!(
        review_delta::compare(&ws, wrong).await?,
        ReviewDelta::Unavailable { .. }
    ));
    let mut missing = request(&ws, &from, &to);
    missing.from.commit.hex = "0".repeat(40);
    assert!(matches!(
        review_delta::compare(&ws, missing).await?,
        ReviewDelta::Unavailable { .. }
    ));
    Ok(())
}

#[tokio::test]
async fn isolates_file_comparisons_from_unrelated_conflicts() -> Result<()> {
    let directory = mkrepo();
    let mut session = WorkerSession::default();
    let mut ws = session.load_workspace(directory.path()).await?;
    let conflict = ws.get_commit(
        &jj_lib::backend::CommitId::try_from_hex(&super::revs::conflict_bookmark().commit.hex)
            .unwrap(),
    )?;
    let before = file(&ws, conflict.tree(), "clean.txt", "before\n").await?;
    let after = file(&ws, conflict.tree(), "clean.txt", "after\n").await?;
    let mut tx = ws.start_transaction().await?;
    let from = tx
        .repo_mut()
        .new_commit(vec![conflict.id().clone()], before)
        .write()
        .await?;
    let to = tx
        .repo_mut()
        .rewrite_commit(&from)
        .set_tree(after)
        .write()
        .await?;
    ws.finish_transaction(tx, "change a file beside an unresolved conflict")
        .await?;
    assert!(matches!(
        review_delta::compare(&ws, request(&ws, &from, &to)).await?,
        ReviewDelta::Unavailable { .. }
    ));
    let mut selected = request(&ws, &from, &to);
    selected.path = Some("clean.txt".into());
    assert!(
        matches!(review_delta::compare(&ws, selected).await?, ReviewDelta::Ready { changes, .. } if changes.len() == 1)
    );
    Ok(())
}
