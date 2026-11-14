//! the AddWorkspace mutation; WorkspaceSession::add_workspace itself is covered in mod.rs

use std::fs;

use anyhow::Result;
use assert_matches::assert_matches;
use jj_lib::ref_name::WorkspaceName;
use tempfile::tempdir;

use super::mkrepo;
use crate::{
    messages::mutations::{AddWorkspace, MutationResult},
    worker::{Mutation as _, WorkerSession, WorkspaceSession},
};

fn has_workspace(ws: &WorkspaceSession, name: &str) -> bool {
    ws.view()
        .get_wc_commit_id(WorkspaceName::new(name))
        .is_some()
}

async fn add(ws: &mut WorkspaceSession<'_>, name: &str, path: &str) -> Result<MutationResult> {
    AddWorkspace {
        name: name.to_owned(),
        path: path.to_owned(),
    }
    .execute_unboxed(ws)
    .await
}

#[tokio::test]
async fn add_workspace_creates_sibling_by_default() -> Result<()> {
    let outer = tempdir()?;
    let repo = mkrepo();
    let project_dir = outer.path().join("cortex");
    fs::rename(repo.path(), &project_dir)?;

    let mut session = WorkerSession::default();
    let mut ws = session.load_workspace(&project_dir).await?;

    let result = add(&mut ws, "review", "").await?;

    assert_matches!(result, MutationResult::Updated { .. });
    assert!(has_workspace(&ws, "review"));
    let expected_path = dunce::canonicalize(outer.path().join("cortex-review"))?;
    assert_eq!(ws.workspace_root("review".to_owned())?, expected_path);

    Ok(())
}

#[tokio::test]
async fn add_workspace_derives_name_from_destination() -> Result<()> {
    let repo = mkrepo();
    let dest_parent = tempdir()?;
    let dest = dest_parent.path().join("experiment");

    let mut session = WorkerSession::default();
    let mut ws = session.load_workspace(repo.path()).await?;

    let result = add(&mut ws, "", &dest.to_string_lossy()).await?;

    assert_matches!(result, MutationResult::Updated { .. });
    assert!(has_workspace(&ws, "experiment"));
    assert!(dest.join(".jj").exists());

    Ok(())
}

#[tokio::test]
async fn add_workspace_resolves_relative_destination_from_workspace_root() -> Result<()> {
    let repo = mkrepo();

    let mut session = WorkerSession::default();
    let mut ws = session.load_workspace(repo.path()).await?;

    let result = add(&mut ws, "nested", "nested-dir").await?;

    assert_matches!(result, MutationResult::Updated { .. });
    assert!(repo.path().join("nested-dir").join(".jj").exists());

    Ok(())
}

#[tokio::test]
async fn add_workspace_rejects_invalid_inputs() -> Result<()> {
    let repo = mkrepo();
    let non_empty = tempdir()?;
    fs::write(non_empty.path().join("file.txt"), "occupied")?;
    let missing_parent = tempdir()?;

    let mut session = WorkerSession::default();
    let mut ws = session.load_workspace(repo.path()).await?;
    let current = ws.name().as_str().to_owned();

    let empty = add(&mut ws, "   ", "").await?;
    assert_matches!(empty, MutationResult::PreconditionError { message } if message.contains("cannot be empty"));

    let separator = add(&mut ws, "a/b", "").await?;
    assert_matches!(separator, MutationResult::PreconditionError { message } if message.contains("path separators"));

    let parent = add(&mut ws, "..", "").await?;
    assert_matches!(parent, MutationResult::PreconditionError { message } if message.contains("path separators"));

    let dup_path = repo.path().join("dup-dir");
    let duplicate = add(&mut ws, &current, &dup_path.to_string_lossy()).await?;
    assert_matches!(duplicate, MutationResult::PreconditionError { message } if message.contains("already exists"));

    let occupied = add(&mut ws, "fresh", &non_empty.path().to_string_lossy()).await?;
    assert_matches!(occupied, MutationResult::PreconditionError { message } if message.contains("not an empty directory"));

    let orphan = missing_parent.path().join("absent").join("leaf");
    let orphaned = add(&mut ws, "orphan", &orphan.to_string_lossy()).await?;
    assert_matches!(orphaned, MutationResult::PreconditionError { message } if message.contains("does not exist"));

    // rejected requests leave nothing behind
    assert!(!dup_path.exists());
    assert!(!orphan.exists());
    assert!(!has_workspace(&ws, "fresh"));
    assert!(!has_workspace(&ws, "orphan"));

    Ok(())
}
