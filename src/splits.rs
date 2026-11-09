//! Immutable split receipts preserve original review and annotation provenance.
use crate::{
    annotations::{self, AnnotationStore},
    messages::{
        RevId,
        splits::{SplitOutcome, SplitOwnership},
    },
};
use anyhow::{Context, Result};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SplitReceipt {
    pub version: u32,
    pub id: String,
    pub created_at: DateTime<Utc>,
    pub source_operation: String,
    pub source: RevId,
    pub selected: RevId,
    pub remainder: RevId,
    pub ownership: Vec<SplitOwnership>,
}
impl SplitReceipt {
    pub fn outcome(&self, operation_id: String) -> SplitOutcome {
        SplitOutcome {
            receipt_id: self.id.clone(),
            source: self.source.clone(),
            selected: self.selected.clone(),
            remainder: self.remainder.clone(),
            operation_id,
            ownership: self.ownership.clone(),
        }
    }
}
pub struct SplitStore {
    dir: PathBuf,
}
impl SplitStore {
    pub fn for_repo(repo: &Path, workspace: &Path) -> Result<Self> {
        Ok(Self::at(
            AnnotationStore::for_repo(repo, workspace)?
                .location()
                .join("splits"),
        ))
    }
    pub fn at(dir: PathBuf) -> Self {
        Self { dir }
    }
    pub fn save(&self, receipt: &SplitReceipt) -> Result<()> {
        fs::create_dir_all(&self.dir)?;
        annotations::write_atomic(
            &self.dir.join(format!("{}.json", receipt.id)),
            &serde_json::to_vec_pretty(receipt)?,
            false,
        )
    }
    pub fn list(&self) -> Result<Vec<SplitReceipt>> {
        let entries = match fs::read_dir(&self.dir) {
            Ok(entries) => entries,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
            Err(error) => return Err(error.into()),
        };
        let mut receipts = Vec::new();
        for entry in entries {
            let path = entry?.path();
            if path.extension().and_then(|ext| ext.to_str()) != Some("json") {
                continue;
            }
            let receipt: SplitReceipt = serde_json::from_slice(&fs::read(&path)?)
                .with_context(|| format!("Reading split receipt {}", path.display()))?;
            anyhow::ensure!(receipt.version == 1, "Unsupported split receipt version");
            receipts.push(receipt);
        }
        receipts.sort_by(|a, b| (&a.created_at, &a.id).cmp(&(&b.created_at, &b.id)));
        Ok(receipts)
    }
}
