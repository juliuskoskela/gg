use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
#[cfg(feature = "ts-rs")]
use ts_rs::TS;

use super::annotations::{
    AnnotationAnchor, AnnotationAuthor, AnnotationList, AnnotationStatus, TargetInput,
};

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[cfg_attr(feature = "ts-rs", derive(TS), ts(export, export_to = "app/messages/"))]
pub struct AnnotationContext {
    pub plugin: String,
    pub id: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[cfg_attr(feature = "ts-rs", derive(TS), ts(export, export_to = "app/messages/"))]
pub struct AnnotationHeader {
    pub format: String,
    pub version: u32,
    pub id: String,
    pub created_at: DateTime<Utc>,
    pub author: AnnotationAuthor,
    #[serde(default)]
    pub targets: Vec<TargetInput>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts-rs", ts(optional))]
    pub anchor: Option<AnnotationAnchor>,
    #[serde(default)]
    pub subject: String,
    #[serde(default)]
    pub workspace: String,
    #[serde(default)]
    pub contexts: Vec<AnnotationContext>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct AnnotationEvent {
    pub id: String,
    pub at: DateTime<Utc>,
    pub author: AnnotationAuthor,
    #[serde(flatten)]
    pub kind: AnnotationEventKind,
}

// ts-rs 7 cannot flatten an enum; keep the persisted flat event shape.
#[cfg(feature = "ts-rs")]
impl TS for AnnotationEvent {
    const EXPORT_TO: Option<&'static str> = Some("app/messages/AnnotationEvent.ts");
    fn name() -> String {
        "AnnotationEvent".into()
    }
    fn inline() -> String {
        "{ id: string, at: string, author: AnnotationAuthor } & AnnotationEventKind".into()
    }
    fn decl() -> String {
        format!("type AnnotationEvent = {};", Self::inline())
    }
    fn dependencies() -> Vec<ts_rs::Dependency> {
        vec![
            ts_rs::Dependency::from_ty::<AnnotationAuthor>().unwrap(),
            ts_rs::Dependency::from_ty::<AnnotationEventKind>().unwrap(),
        ]
    }
    fn transparent() -> bool {
        false
    }
}

#[cfg(all(test, feature = "ts-rs"))]
#[test]
fn export_bindings_annotationevent() {
    AnnotationEvent::export().unwrap();
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(tag = "type", rename_all = "snake_case")]
#[cfg_attr(feature = "ts-rs", derive(TS), ts(export, export_to = "app/messages/"))]
pub enum AnnotationEventKind {
    Post { body: String },
    Edit { post: String, body: String },
    Status { status: AnnotationStatus },
    AddTargets { targets: Vec<TargetInput> },
    RemoveTarget { anchor: AnnotationAnchor },
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[cfg_attr(feature = "ts-rs", derive(TS), ts(export, export_to = "app/messages/"))]
pub struct AnnotationArchive {
    pub header: AnnotationHeader,
    pub events: Vec<AnnotationEvent>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[cfg_attr(feature = "ts-rs", derive(TS), ts(export, export_to = "app/messages/"))]
pub struct AnnotationBundle {
    #[cfg_attr(feature = "ts-rs", ts(type = "\"gg.annotation-bundle\""))]
    pub format: String,
    #[cfg_attr(feature = "ts-rs", ts(type = "1"))]
    pub version: u32,
    pub threads: Vec<AnnotationArchive>,
}

#[derive(Deserialize, Debug)]
#[cfg_attr(feature = "ts-rs", derive(TS), ts(export, export_to = "app/messages/"))]
pub struct PluginNotesRequest {
    pub plugin: String,
    pub context: String,
    pub workspace: String,
    pub action: PluginNoteAction,
}

#[derive(Deserialize, Debug)]
#[serde(tag = "type")]
#[cfg_attr(feature = "ts-rs", derive(TS), ts(export, export_to = "app/messages/"))]
pub enum PluginNoteAction {
    List,
    Create {
        targets: Vec<TargetInput>,
        body: String,
    },
    Reply {
        id: String,
        body: String,
    },
    Edit {
        id: String,
        post: String,
        body: String,
    },
    SetStatus {
        id: String,
        status: AnnotationStatus,
    },
    Export,
    Import {
        bundle: AnnotationBundle,
    },
}

#[derive(Serialize, Debug)]
#[serde(tag = "type", content = "value")]
#[cfg_attr(feature = "ts-rs", derive(TS), ts(export, export_to = "app/messages/"))]
pub enum PluginNotesResponse {
    List(AnnotationList),
    Bundle(AnnotationBundle),
}
