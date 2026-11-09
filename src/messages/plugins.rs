use serde::{Deserialize, Serialize};

#[cfg(feature = "ts-rs")]
use ts_rs::TS;

#[derive(Debug, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-rs", derive(TS), ts(export, export_to = "app/messages/"))]
pub struct PluginRequest {
    pub plugin: String,
    pub workspace: String,
    pub operation: PluginOperation,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "type")]
#[cfg_attr(feature = "ts-rs", derive(TS), ts(export, export_to = "app/messages/"))]
pub enum PluginOperation {
    Get {
        key: String,
    },
    Set {
        key: String,
        #[cfg_attr(feature = "ts-rs", ts(type = "unknown"))]
        value: serde_json::Value,
    },
    Delete {
        key: String,
    },
    Keys,
    Publish {
        kind: String,
        #[cfg_attr(feature = "ts-rs", ts(type = "unknown"))]
        data: serde_json::Value,
    },
    Facts {
        after: Option<String>,
    },
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[cfg_attr(feature = "ts-rs", derive(TS), ts(export, export_to = "app/messages/"))]
pub struct PluginFact {
    pub id: String,
    pub plugin: String,
    pub kind: String,
    pub at: String,
    #[cfg_attr(feature = "ts-rs", ts(type = "unknown"))]
    pub data: serde_json::Value,
}

#[derive(Debug, Default, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-rs", derive(TS), ts(export, export_to = "app/messages/"))]
pub struct PluginData {
    #[cfg_attr(feature = "ts-rs", ts(type = "unknown | null"))]
    pub value: Option<serde_json::Value>,
    pub keys: Vec<String>,
    pub facts: Vec<PluginFact>,
}
