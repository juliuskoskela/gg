use serde::{Deserialize, Serialize};
#[cfg(feature = "ts-rs")]
use ts_rs::TS;

use super::{RevId, queries::RevChange};

#[derive(Debug, Deserialize)]
#[cfg_attr(feature = "ts-rs", derive(TS), ts(export, export_to = "app/messages/"))]
pub struct ReviewDeltaRequest {
    pub from: RevId,
    pub to: RevId,
    pub path: Option<String>,
    #[serde(default)]
    pub full_context: bool,
}

#[derive(Debug, Serialize)]
#[serde(tag = "type")]
#[cfg_attr(feature = "ts-rs", derive(TS), ts(export, export_to = "app/messages/"))]
pub enum ReviewDelta {
    Ready {
        changes: Vec<RevChange>,
        description_before: String,
        description_after: String,
        rebased: bool,
    },
    Unavailable {
        reason: String,
    },
}
