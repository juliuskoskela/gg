use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
#[cfg(feature = "ts-rs")]
use ts_rs::TS;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[cfg_attr(feature = "ts-rs", derive(TS), ts(export, export_to = "app/messages/"))]
pub struct ReviewPerson {
    pub name: String,
    pub email: String,
}

impl ReviewPerson {
    pub fn key(&self) -> String {
        if self.email.trim().is_empty() {
            format!("name:{}", self.name.trim())
        } else {
            self.email.trim().to_lowercase()
        }
    }
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
#[cfg_attr(feature = "ts-rs", derive(TS), ts(export, export_to = "app/messages/"))]
pub enum ReviewState {
    Reviewed,
    Changed,
    Gone,
}

#[derive(Clone, Debug, Serialize)]
#[cfg_attr(feature = "ts-rs", derive(TS), ts(export, export_to = "app/messages/"))]
pub struct FileReview {
    pub path: String,
    pub reviewed_commit_id: String,
    pub reviewed_at: DateTime<Utc>,
    pub state: ReviewState,
}

#[derive(Clone, Debug, Serialize)]
#[cfg_attr(feature = "ts-rs", derive(TS), ts(export, export_to = "app/messages/"))]
pub struct ChangeReview {
    pub change_id: String,
    pub commit_id: Option<String>,
    pub reviewed_commit_id: Option<String>,
    pub state: ReviewState,
    pub total: usize,
    pub reviewed: usize,
    pub files: Vec<FileReview>,
}

#[derive(Debug, Serialize)]
#[cfg_attr(feature = "ts-rs", derive(TS), ts(export, export_to = "app/messages/"))]
pub struct ReviewProgress {
    pub me: ReviewPerson,
    pub location: String,
    pub changes: Vec<ChangeReview>,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type")]
#[cfg_attr(feature = "ts-rs", derive(TS), ts(export, export_to = "app/messages/"))]
pub enum ReviewRequest {
    List,
    Set {
        id: super::RevId,
        path: Option<String>,
        reviewed: bool,
    },
}
