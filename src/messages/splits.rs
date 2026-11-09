use super::RevId;
use serde::{Deserialize, Serialize};
#[cfg(feature = "ts-rs")]
use ts_rs::TS;

#[derive(Clone, Debug, Deserialize)]
#[cfg_attr(feature = "ts-rs", derive(TS), ts(export, export_to = "app/messages/"))]
pub struct SplitRevision {
    pub source: RevId,
    pub operation_id: String,
    pub paths: Vec<String>,
    pub selected_description: String,
    pub remainder_description: String,
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
#[cfg_attr(feature = "ts-rs", derive(TS), ts(export, export_to = "app/messages/"))]
pub enum SplitOwner {
    Selected,
    Remainder,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-rs", derive(TS), ts(export, export_to = "app/messages/"))]
pub struct SplitOwnership {
    pub path: String,
    pub owner: SplitOwner,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-rs", derive(TS), ts(export, export_to = "app/messages/"))]
pub struct SplitOutcome {
    pub receipt_id: String,
    pub source: RevId,
    pub selected: RevId,
    pub remainder: RevId,
    pub operation_id: String,
    pub ownership: Vec<SplitOwnership>,
}
