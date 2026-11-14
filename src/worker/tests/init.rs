//! initializing a folder chosen from the start page: a plain folder, a Git checkout and paths that
//! can't hold a repository

use std::{
    fs,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::mpsc::channel,
};

use anyhow::{Context, Result};
use assert_matches::assert_matches;
use jj_lib::object_id::ObjectId as _;
use tempfile::tempdir;

use crate::{
    messages::{LoadErrorKind, RepoConfig},
    worker::{Session, SessionEvent, WorkerSession, workspace_load_error},
};

/// initializes, then opens the result in the same worker, as the start page does
async fn init_and_open(path: &Path, colocated: bool) -> Result<(Result<PathBuf>, RepoConfig)> {
    let (tx, rx) = channel::<SessionEvent>();
    let (init_tx, init_rx) = channel();
    let (open_tx, open_rx) = channel();
    tx.send(SessionEvent::InitWorkspace {
        tx: init_tx,
        wd: path.to_owned(),
        colocated,
    })?;
    tx.send(SessionEvent::OpenWorkspace {
        tx: open_tx,
        wd: Some(path.to_owned()),
    })?;
    tx.send(SessionEvent::EndSession)?;
    WorkerSession::default().handle_events(&rx).await?;
    Ok((init_rx.recv()?, open_rx.recv()??))
}

fn git(dir: &Path, args: &[&str]) -> Result<String> {
    let output = Command::new("git")
        .args(["-c", "user.name=Test", "-c", "user.email=test@test.com"])
        .args(args)
        .current_dir(dir)
        .stderr(Stdio::null())
        .output()
        .context("run git")?;
    assert!(output.status.success(), "git {args:?} failed");
    Ok(String::from_utf8(output.stdout)?.trim().to_owned())
}

fn git_checkout_with_commit() -> Result<tempfile::TempDir> {
    let dir = tempdir()?;
    git(dir.path(), &["init", "--quiet"])?;
    fs::write(dir.path().join("readme.txt"), "hello\n")?;
    git(dir.path(), &["add", "readme.txt"])?;
    git(dir.path(), &["commit", "--quiet", "-m", "Add readme"])?;
    Ok(dir)
}

#[tokio::test]
async fn plain_folder_is_offered_initialization() -> Result<()> {
    let dir = tempdir()?;
    let config = workspace_load_error(dir.path().to_owned(), "no repo".into());
    assert_matches!(
        config,
        RepoConfig::LoadError {
            kind: LoadErrorKind::Uninitialized,
            git_root: None,
            ..
        }
    );
    Ok(())
}

#[tokio::test]
async fn init_plain_folder_colocated_opens_workspace() -> Result<()> {
    let dir = tempdir()?;
    let (init, config) = init_and_open(dir.path(), true).await?;
    assert_eq!(init?, dunce::canonicalize(dir.path())?);
    assert_matches!(config, RepoConfig::Workspace { .. });
    assert!(dir.path().join(".jj").is_dir());
    assert!(dir.path().join(".git").is_dir());
    Ok(())
}

#[tokio::test]
async fn init_plain_folder_without_colocation_keeps_git_inside_jj() -> Result<()> {
    let dir = tempdir()?;
    let (init, config) = init_and_open(dir.path(), false).await?;
    init?;
    assert_matches!(config, RepoConfig::Workspace { .. });
    assert!(dir.path().join(".jj").is_dir());
    assert!(!dir.path().join(".git").exists());
    Ok(())
}

#[tokio::test]
async fn git_checkout_reports_its_root_from_a_subfolder() -> Result<()> {
    let dir = git_checkout_with_commit()?;
    fs::create_dir(dir.path().join("nested"))?;
    let config = workspace_load_error(dir.path().join("nested"), "no repo".into());
    assert_matches!(config, RepoConfig::LoadError { kind: LoadErrorKind::Uninitialized, git_root: Some(root), .. } => {
        assert_eq!(PathBuf::from(root.0), dir.path());
    });
    Ok(())
}

#[tokio::test]
async fn init_git_checkout_colocated_keeps_history() -> Result<()> {
    let dir = git_checkout_with_commit()?;
    let head = git(dir.path(), &["rev-parse", "HEAD"])?;
    let (init, config) = init_and_open(dir.path(), true).await?;
    init?;
    assert_matches!(config, RepoConfig::Workspace { .. });
    assert!(dir.path().join(".jj").is_dir());

    let mut session = WorkerSession::default();
    let mut ws = session.load_workspace(dir.path()).await?;
    ws.import_and_snapshot(true, false).await?;
    let wc = ws.get_commit(ws.wc_id())?;
    assert_eq!(wc.parent_ids()[0].hex(), head);
    Ok(())
}

#[tokio::test]
async fn init_git_checkout_without_colocation_is_refused() -> Result<()> {
    let dir = git_checkout_with_commit()?;
    let (init, config) = init_and_open(dir.path(), false).await?;
    let err = init.expect_err("jj refuses a separate store beside an existing Git repository");
    assert!(format!("{err:#}").contains("already has a Git repository"));
    assert!(!dir.path().join(".jj").exists());
    assert_matches!(
        config,
        RepoConfig::LoadError {
            kind: LoadErrorKind::Uninitialized,
            ..
        }
    );
    Ok(())
}

#[tokio::test]
async fn nonexistent_path_is_not_offered_initialization() -> Result<()> {
    let dir = tempdir()?;
    let missing = dir.path().join("missing");
    let config = workspace_load_error(missing.clone(), "missing".into());
    assert_matches!(
        config,
        RepoConfig::LoadError {
            kind: LoadErrorKind::NotFound,
            git_root: None,
            ..
        }
    );

    let (init, _) = init_and_open(&missing, true).await?;
    let err = init.expect_err("nothing to initialize");
    assert!(format!("{err:#}").contains("There is no folder at"));
    assert!(!missing.exists());
    Ok(())
}

#[tokio::test]
async fn file_is_not_offered_initialization() -> Result<()> {
    let dir = tempdir()?;
    let file = dir.path().join("notes.txt");
    fs::write(&file, "not a folder")?;
    let config = workspace_load_error(file.clone(), "not a folder".into());
    assert_matches!(
        config,
        RepoConfig::LoadError {
            kind: LoadErrorKind::NotADirectory,
            ..
        }
    );

    let (init, _) = init_and_open(&file, true).await?;
    assert!(format!("{:#}", init.unwrap_err()).contains("is a file, not a folder"));
    assert!(!dir.path().join(".jj").exists());
    Ok(())
}

#[tokio::test]
async fn broken_workspace_is_not_offered_initialization() -> Result<()> {
    let dir = tempdir()?;
    fs::create_dir(dir.path().join(".jj"))?;
    let config = workspace_load_error(dir.path().to_owned(), "broken".into());
    assert_matches!(
        config,
        RepoConfig::LoadError {
            kind: LoadErrorKind::Other,
            ..
        }
    );
    Ok(())
}

#[cfg(unix)]
#[tokio::test]
async fn read_only_folder_explains_the_permission_problem() -> Result<()> {
    use std::os::unix::fs::PermissionsExt as _;

    let dir = tempdir()?;
    fs::set_permissions(dir.path(), fs::Permissions::from_mode(0o555))?;
    // root ignores permissions, so there is nothing to explain
    if fs::create_dir(dir.path().join("probe")).is_ok() {
        return Ok(());
    }
    let result = WorkerSession::default()
        .init_repository(dir.path(), true)
        .await;
    fs::set_permissions(dir.path(), fs::Permissions::from_mode(0o755))?;
    let message = format!("{:#}", result.expect_err("the folder is read-only"));
    assert!(
        message.contains("GG can't write to") && message.contains("Check the folder's permissions"),
        "{message}"
    );
    Ok(())
}
