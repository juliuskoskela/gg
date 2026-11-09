use serde::{Deserialize, Serialize};
#[cfg(feature = "ts-rs")]
use ts_rs::TS;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
#[cfg_attr(feature = "ts-rs", derive(TS), ts(export, export_to = "app/messages/"))]
pub struct GithubRequest {
    pub owner: String,
    pub repo: String,
    pub endpoint: GithubEndpoint,
    pub etag: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(tag = "type")]
#[serde(deny_unknown_fields)]
#[cfg_attr(feature = "ts-rs", derive(TS), ts(export, export_to = "app/messages/"))]
pub enum GithubEndpoint {
    List { page: u8 },
    Pull { number: u32 },
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[cfg_attr(feature = "ts-rs", derive(TS), ts(export, export_to = "app/messages/"))]
pub struct GithubPull {
    pub number: u32,
    pub repository_id: String,
    pub title: String,
    pub author: String,
    pub state: String,
    pub draft: bool,
    pub merged: bool,
    pub head_sha: String,
    pub base_sha: String,
    pub head_ref: String,
    pub requested_reviewers: Vec<String>,
    pub updated_at: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[cfg_attr(feature = "ts-rs", derive(TS), ts(export, export_to = "app/messages/"))]
pub struct GithubResponse {
    pub status: u16,
    pub etag: Option<String>,
    pub retry_after_seconds: Option<u32>,
    pub reset_at_seconds: Option<u32>,
    pub remaining: Option<u32>,
    pub has_next: bool,
    pub pulls: Vec<GithubPull>,
}
