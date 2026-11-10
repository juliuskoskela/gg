use std::fs;

use anyhow::Result;
use assert_matches::assert_matches;

use super::{get_by_chid, mkrepo, revs};
use crate::{
    messages::{
        RevId,
        mutations::{MutationResult, WriteFile},
        queries::FileContent,
    },
    worker::{Mutation as _, WorkerSession, WorkspaceSession, files},
};

const NOT_FILE: &str = "That path is not a file in this repository.";
const CANT_EDIT: &str = "This file can't be edited here.";
const CHANGED: &str = "This file changed since it was opened.";

// the fixtures' short ids are not full ids, so resolve them the way history tests do
fn full(ws: &WorkspaceSession, id: RevId) -> Result<RevId> {
    Ok(ws.format_id(&get_by_chid(ws, &id)?))
}

fn wc_id(ws: &WorkspaceSession) -> Result<RevId> {
    Ok(ws.format_id(&ws.get_commit(ws.wc_id())?))
}

fn text_of(content: FileContent) -> (String, String, bool, bool) {
    match content {
        FileContent::Text {
            text,
            version,
            editable,
            has_conflict,
            ..
        } => (text, version, editable, has_conflict),
        other => panic!("expected text, got {other:?}"),
    }
}

fn precondition_message(result: MutationResult) -> String {
    match result {
        MutationResult::PreconditionError { message } => message,
        other => panic!("expected a precondition error, got {other:?}"),
    }
}

#[tokio::test]
async fn query_working_copy_reads_disk_and_is_editable() -> Result<()> {
    let repo = mkrepo();
    let mut session = WorkerSession::default();
    let ws = session.load_workspace(repo.path()).await?;

    // not snapshotted yet: the editor must see it anyway
    fs::write(repo.path().join("a.txt"), "unsaved edit\r\nsecond")?;
    let id = wc_id(&ws)?;
    let content = files::query_file(&ws, id, "a.txt".into()).await?;
    let (text, version, editable, has_conflict) = text_of(content);
    assert_eq!(text, "unsaved edit\r\nsecond");
    assert_eq!(version, files::version_of(text.as_bytes())?);
    assert!(editable);
    assert!(!has_conflict);
    Ok(())
}

#[tokio::test]
async fn query_older_commit_is_read_only() -> Result<()> {
    let repo = mkrepo();
    let mut session = WorkerSession::default();
    let ws = session.load_workspace(repo.path()).await?;

    let content = files::query_file(&ws, full(&ws, revs::main_bookmark())?, "a.txt".into()).await?;
    let (text, _, editable, has_conflict) = text_of(content);
    assert!(!text.is_empty());
    assert!(!editable);
    assert!(!has_conflict);
    Ok(())
}

#[tokio::test]
async fn query_missing_and_binary() -> Result<()> {
    let repo = mkrepo();
    let mut session = WorkerSession::default();
    let ws = session.load_workspace(repo.path()).await?;
    let id = wc_id(&ws)?;

    assert_matches!(
        files::query_file(&ws, id.clone(), "nope.txt".into()).await?,
        FileContent::Missing { .. }
    );
    assert_matches!(
        files::query_file(&ws, full(&ws, revs::main_bookmark())?, "nope.txt".into()).await?,
        FileContent::Missing { .. }
    );

    fs::write(repo.path().join("blob.bin"), [1u8, 0, 2, 3])?;
    assert_matches!(
        files::query_file(&ws, id.clone(), "blob.bin".into()).await?,
        FileContent::Binary { size: 4, .. }
    );
    fs::write(repo.path().join("latin1.txt"), [0xe9u8, 0xe8])?;
    assert_matches!(
        files::query_file(&ws, id.clone(), "latin1.txt".into()).await?,
        FileContent::Binary { size: 2, .. }
    );
    let big = vec![b'x'; files::MAX_FILE_SIZE as usize + 1];
    fs::write(repo.path().join("big.txt"), big)?;
    assert_matches!(
        files::query_file(&ws, id, "big.txt".into()).await?,
        FileContent::TooLarge { size, limit, .. }
            if size == files::MAX_FILE_SIZE + 1 && limit == files::MAX_FILE_SIZE
    );
    Ok(())
}

#[tokio::test]
async fn query_rejects_bad_paths() -> Result<()> {
    let repo = mkrepo();
    let mut session = WorkerSession::default();
    let ws = session.load_workspace(repo.path()).await?;
    let id = wc_id(&ws)?;

    for path in [
        "",
        "/etc/passwd",
        "../outside.txt",
        "a/../../b",
        "a//b",
        "./a.txt",
        ".jj/repo/config.toml",
        ".git/config",
        "a.txt/",
    ] {
        assert!(
            files::query_file(&ws, id.clone(), path.into())
                .await
                .is_err(),
            "{path:?} should be rejected"
        );
    }
    Ok(())
}

#[tokio::test]
async fn query_conflicted_file_has_markers() -> Result<()> {
    let repo = mkrepo();
    let mut session = WorkerSession::default();
    let ws = session.load_workspace(repo.path()).await?;

    let content =
        files::query_file(&ws, full(&ws, revs::conflict_bookmark())?, "b.txt".into()).await?;
    let (text, _, editable, has_conflict) = text_of(content);
    assert!(has_conflict);
    assert!(!editable);
    assert!(text.contains("<<<<<<<"), "{text}");
    assert!(text.contains(">>>>>>>"), "{text}");
    Ok(())
}

#[tokio::test]
async fn write_file_updates_disk_and_working_copy_tree() -> Result<()> {
    let repo = mkrepo();
    let mut session = WorkerSession::default();
    let mut ws = session.load_workspace(repo.path()).await?;
    let id = wc_id(&ws)?;

    let (_, version, _, _) = text_of(files::query_file(&ws, id.clone(), "a.txt".into()).await?);
    let result = WriteFile {
        id: id.clone(),
        path: "a.txt".into(),
        text: "changed\r\nline endings kept\r\n".into(),
        base_version: version,
    }
    .execute_unboxed(&mut ws)
    .await?;
    assert_matches!(result, MutationResult::Updated { .. });
    assert_eq!(
        fs::read(repo.path().join("a.txt"))?,
        b"changed\r\nline endings kept\r\n"
    );

    // the snapshot recorded it in the working-copy commit
    let new_id = wc_id(&ws)?;
    assert_ne!(new_id.commit.hex, id.commit.hex);
    let committed = files::query_file(&ws, new_id, "a.txt".into()).await?;
    let (text, _, editable, _) = text_of(committed);
    assert_eq!(text, "changed\r\nline endings kept\r\n");
    assert!(editable);
    let old = files::query_file(&ws, id, "a.txt".into()).await?;
    assert_ne!(text_of(old).0, text);
    Ok(())
}

#[tokio::test]
async fn write_file_refuses_stale_version() -> Result<()> {
    let repo = mkrepo();
    let mut session = WorkerSession::default();
    let mut ws = session.load_workspace(repo.path()).await?;
    let id = wc_id(&ws)?;

    let (_, version, _, _) = text_of(files::query_file(&ws, id.clone(), "a.txt".into()).await?);
    fs::write(repo.path().join("a.txt"), "someone else was here")?;
    let result = WriteFile {
        id,
        path: "a.txt".into(),
        text: "mine".into(),
        base_version: version,
    }
    .execute_unboxed(&mut ws)
    .await?;
    assert_eq!(precondition_message(result), CHANGED);
    assert_eq!(
        fs::read_to_string(repo.path().join("a.txt"))?,
        "someone else was here"
    );
    Ok(())
}

#[tokio::test]
async fn write_file_refuses_other_revisions_and_bad_paths() -> Result<()> {
    let repo = mkrepo();
    let mut session = WorkerSession::default();
    let mut ws = session.load_workspace(repo.path()).await?;
    let id = wc_id(&ws)?;

    let result = WriteFile {
        id: full(&ws, revs::main_bookmark())?,
        path: "a.txt".into(),
        text: "x".into(),
        base_version: "".into(),
    }
    .execute_unboxed(&mut ws)
    .await?;
    assert_eq!(
        precondition_message(result),
        "Only the working copy can be edited. Make this revision the working copy first."
    );

    for path in ["../x", "/abs", ".git/config", ""] {
        let result = WriteFile {
            id: id.clone(),
            path: path.into(),
            text: "x".into(),
            base_version: "".into(),
        }
        .execute_unboxed(&mut ws)
        .await?;
        assert_eq!(precondition_message(result), NOT_FILE, "{path:?}");
    }

    // directories and missing files are not editable
    fs::create_dir(repo.path().join("dir"))?;
    for path in ["dir", "missing.txt"] {
        let result = WriteFile {
            id: id.clone(),
            path: path.into(),
            text: "x".into(),
            base_version: "".into(),
        }
        .execute_unboxed(&mut ws)
        .await?;
        assert_eq!(precondition_message(result), CANT_EDIT, "{path:?}");
    }
    Ok(())
}

#[tokio::test]
async fn write_file_unchanged_bytes() -> Result<()> {
    let repo = mkrepo();
    let mut session = WorkerSession::default();
    let mut ws = session.load_workspace(repo.path()).await?;
    let id = wc_id(&ws)?;

    let (text, version, _, _) = text_of(files::query_file(&ws, id.clone(), "a.txt".into()).await?);
    let result = WriteFile {
        id,
        path: "a.txt".into(),
        text,
        base_version: version,
    }
    .execute_unboxed(&mut ws)
    .await?;
    assert_matches!(result, MutationResult::Unchanged);
    Ok(())
}
