use std::{
    fs,
    path::{Path, PathBuf},
};

use anyhow::{Result, anyhow};
use futures_util::AsyncReadExt as _;
use jj_lib::{
    backend::{CommitId, TreeValue},
    commit::Commit,
    repo::Repo as _,
    repo_path::{RepoPath, RepoPathBuf},
};

use super::{WorkspaceSession, mutations::read_file_content};
use crate::messages::{RevId, queries::FileContent};

pub const MAX_FILE_SIZE: u64 = 5 * 1024 * 1024;
const BINARY_SNIFF: usize = 8000;

/// what is at a path in the working directory
pub enum DiskEntry {
    Missing,
    Regular(fs::Metadata),
    /// symlinks and anything else that is not a file
    Other,
}

/// repo-relative, `/`-separated, no `..`, and never inside `.jj` or `.git`
pub fn validate_path(path: &str) -> Result<RepoPathBuf> {
    let invalid =
        || anyhow!("invalid path {path:?}: expected a relative path inside the repository");
    if path.is_empty() || path.starts_with('/') || path.contains('\\') || path.contains('\0') {
        return Err(invalid());
    }
    for (i, component) in path.split('/').enumerate() {
        if component.is_empty() || component == "." || component == ".." {
            return Err(invalid());
        }
        // a drive prefix such as `C:` would escape the root on windows
        if component.ends_with(':') && component.len() == 2 {
            return Err(invalid());
        }
        if i == 0
            && (component.eq_ignore_ascii_case(".jj") || component.eq_ignore_ascii_case(".git"))
        {
            return Err(anyhow!("{path:?} is inside the repository's own metadata"));
        }
    }
    RepoPathBuf::from_internal_string(path).map_err(|_| invalid())
}

pub fn workspace_root(ws: &WorkspaceSession<'_>) -> Result<PathBuf> {
    ws.workspace_root(ws.name().as_str().to_owned())
}

/// symlinked parent directories could lead outside the workspace, so they count as `Other`
pub fn disk_entry(root: &Path, path: &RepoPath) -> Result<(PathBuf, DiskEntry)> {
    let full = path.to_fs_path(root)?;
    let mut current = root.to_owned();
    let components: Vec<_> = path.components().collect();
    for (i, component) in components.iter().enumerate() {
        current.push(component.as_internal_str());
        let meta = match fs::symlink_metadata(&current) {
            Ok(meta) => meta,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                return Ok((full, DiskEntry::Missing));
            }
            // a file where a directory was expected
            Err(e) if e.kind() == std::io::ErrorKind::NotADirectory => {
                return Ok((full, DiskEntry::Missing));
            }
            Err(e) => return Err(e.into()),
        };
        let last = i + 1 == components.len();
        if last {
            return Ok((
                full,
                if meta.is_file() {
                    DiskEntry::Regular(meta)
                } else if meta.is_dir() {
                    DiskEntry::Missing
                } else {
                    DiskEntry::Other
                },
            ));
        }
        if meta.file_type().is_symlink() {
            return Ok((full, DiskEntry::Other));
        }
        if !meta.is_dir() {
            return Ok((full, DiskEntry::Missing));
        }
    }
    Ok((full, DiskEntry::Missing))
}

/// the git blob id of the exact bytes, as hex
pub fn version_of(bytes: &[u8]) -> Result<String> {
    let id = gix::objs::compute_hash(gix::hash::Kind::Sha1, gix::objs::Kind::Blob, bytes)
        .map_err(|e| anyhow!("could not fingerprint file: {e}"))?;
    Ok(id.to_string())
}

pub fn resolve_commit(ws: &WorkspaceSession<'_>, id: &RevId) -> Result<Commit> {
    let commit_id =
        CommitId::try_from_hex(&id.commit.hex).ok_or_else(|| anyhow!("invalid commit ID"))?;
    let commit = ws.repo().store().get_commit(&commit_id)?;
    if commit.change_id().reverse_hex() != id.change.hex {
        return Err(anyhow!("the commit does not belong to this change"));
    }
    Ok(commit)
}

/// null bytes or invalid utf-8 mean the editor can't show it
fn text_or_binary(
    path: &str,
    bytes: Vec<u8>,
    editable: bool,
    has_conflict: bool,
) -> Result<FileContent> {
    let sniff = &bytes[..bytes.len().min(BINARY_SNIFF)];
    if sniff.contains(&0) {
        return Ok(FileContent::Binary {
            path: path.to_owned(),
            size: bytes.len() as u64,
        });
    }
    let size = bytes.len() as u64;
    match String::from_utf8(bytes) {
        Ok(text) => Ok(FileContent::Text {
            path: path.to_owned(),
            version: version_of(text.as_bytes())?,
            text,
            editable,
            has_conflict,
        }),
        Err(_) => Ok(FileContent::Binary {
            path: path.to_owned(),
            size,
        }),
    }
}

pub async fn query_file(ws: &WorkspaceSession<'_>, id: RevId, path: String) -> Result<FileContent> {
    let repo_path = validate_path(&path)?;
    let commit = resolve_commit(ws, &id)?;
    let tree = commit.tree();
    let value = tree.path_value(&repo_path).await?;
    let has_conflict = !value.is_resolved();

    if commit.id() == ws.wc_id() {
        let root = workspace_root(ws)?;
        let (full, entry) = disk_entry(&root, &repo_path)?;
        let meta = match entry {
            DiskEntry::Missing => return Ok(FileContent::Missing { path }),
            // symlinks are not editable text; the size is not meaningful
            DiskEntry::Other => return Ok(FileContent::Binary { path, size: 0 }),
            DiskEntry::Regular(meta) => meta,
        };
        if meta.len() > MAX_FILE_SIZE {
            return Ok(FileContent::TooLarge {
                path,
                size: meta.len(),
                limit: MAX_FILE_SIZE,
            });
        }
        let bytes = fs::read(&full)?;
        return text_or_binary(&path, bytes, !has_conflict, has_conflict);
    }

    let bytes = if has_conflict {
        read_file_content(ws.repo().store(), &tree, &repo_path).await?
    } else {
        match value.into_resolved() {
            Ok(Some(TreeValue::File { id, .. })) => {
                let mut reader = ws.repo().store().read_file(&repo_path, &id).await?;
                let mut bytes = Vec::new();
                let mut buffer = [0u8; 64 * 1024];
                let mut total = 0u64;
                loop {
                    let n = reader.read(&mut buffer).await?;
                    if n == 0 {
                        break;
                    }
                    total += n as u64;
                    // keep counting without keeping the content so the reported size is real
                    if total <= MAX_FILE_SIZE {
                        bytes.extend_from_slice(&buffer[..n]);
                    }
                }
                if total > MAX_FILE_SIZE {
                    return Ok(FileContent::TooLarge {
                        path,
                        size: total,
                        limit: MAX_FILE_SIZE,
                    });
                }
                bytes
            }
            // symlinks and submodules
            Ok(Some(TreeValue::Symlink(_) | TreeValue::GitSubmodule(_))) => {
                return Ok(FileContent::Binary { path, size: 0 });
            }
            // directories and absent paths
            Ok(Some(TreeValue::Tree(_)) | None) => return Ok(FileContent::Missing { path }),
            Err(_) => unreachable!("conflicts are handled above"),
        }
    };
    if bytes.len() as u64 > MAX_FILE_SIZE {
        return Ok(FileContent::TooLarge {
            path,
            size: bytes.len() as u64,
            limit: MAX_FILE_SIZE,
        });
    }
    text_or_binary(&path, bytes, false, has_conflict)
}
