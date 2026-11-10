use std::{fs, io::Write as _};

use anyhow::Result;
use async_trait::async_trait;

use super::precondition;
use crate::{
    messages::mutations::{MutationOptions, MutationResult, WriteFile},
    worker::{
        Mutation, WorkspaceSession,
        files::{self, DiskEntry},
    },
};

#[async_trait(?Send)]
impl Mutation for WriteFile {
    async fn execute(
        self: Box<Self>,
        ws: &mut WorkspaceSession,
        _options: &MutationOptions,
    ) -> Result<MutationResult> {
        // no transaction: the write goes to disk and the snapshot below records it
        let commit = ws.resolve_change_id(&self.id)?;
        if commit.id() != ws.wc_id() {
            precondition!(
                "Only the working copy can be edited. Make this revision the working copy first."
            );
        }
        let Ok(repo_path) = files::validate_path(&self.path) else {
            precondition!("That path is not a file in this repository.");
        };

        // record edits made outside GG first, so the conflict check sees the current tree
        ws.import_and_snapshot(true, false).await?;
        let tree = ws.get_commit(&ws.wc_id().clone())?.tree();
        let conflicted = !tree.path_value(&repo_path).await?.is_resolved();

        let root = files::workspace_root(ws)?;
        let (full, entry) = files::disk_entry(&root, &repo_path)?;
        let DiskEntry::Regular(meta) = entry else {
            precondition!("This file can't be edited here.");
        };
        if conflicted {
            precondition!("This file can't be edited here.");
        }

        let current = fs::read(&full)?;
        if files::version_of(&current)? != self.base_version {
            precondition!("This file changed since it was opened.");
        }
        if current == self.text.as_bytes() {
            return Ok(MutationResult::Unchanged);
        }

        // temp file in the same directory so the rename stays on one filesystem
        let dir = full
            .parent()
            .ok_or_else(|| anyhow::anyhow!("file has no parent directory"))?;
        let mut temp = tempfile::NamedTempFile::new_in(dir)?;
        temp.write_all(self.text.as_bytes())?;
        temp.as_file().sync_all()?;
        fs::set_permissions(temp.path(), meta.permissions())?;
        temp.persist(&full).map_err(|e| e.error)?;

        ws.import_and_snapshot(true, false).await?;

        let new_commit = ws.get_commit(&ws.wc_id().clone())?;
        Ok(MutationResult::Updated {
            new_status: ws.format_status(),
            new_selection: Some(ws.format_header(&new_commit, Some(false))?),
        })
    }
}
