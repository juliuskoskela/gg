//! Annotations: local notes attached to repository content.
//!
//! An annotation is the root of a thread. Its first post is the note itself;
//! later posts are replies, from people or agents. Everything is stored as
//! append-only events so that the app and the command line can write to the
//! same thread without overwriting each other.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
#[cfg(feature = "ts-rs")]
use ts_rs::TS;

pub const ANNOTATION_FORMAT: &str = "gg.annotation";
pub const ANNOTATION_VERSION: u32 = 2;

/// What an annotation points at. Ids are full hex strings and paths are
/// repository-relative with forward slashes, so the anchor stays meaningful
/// when copied out of GG.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(tag = "kind", rename_all = "snake_case")]
#[cfg_attr(feature = "ts-rs", derive(TS), ts(export, export_to = "app/messages/"))]
pub enum AnnotationAnchor {
    Revision {
        change_id: String,
        commit_id: String,
    },
    Bookmark {
        name: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        #[cfg_attr(feature = "ts-rs", ts(optional))]
        remote: Option<String>,
        change_id: String,
        commit_id: String,
    },
    File {
        change_id: String,
        commit_id: String,
        path: String,
    },
    Lines {
        change_id: String,
        commit_id: String,
        path: String,
        side: LineSide,
        start: u32,
        end: u32,
        /// the annotated text, so the spot can be found again after edits
        quote: String,
    },
}

impl AnnotationAnchor {
    pub fn change_id(&self) -> &str {
        match self {
            AnnotationAnchor::Revision { change_id, .. }
            | AnnotationAnchor::Bookmark { change_id, .. }
            | AnnotationAnchor::File { change_id, .. }
            | AnnotationAnchor::Lines { change_id, .. } => change_id,
        }
    }

    pub fn commit_id(&self) -> &str {
        match self {
            AnnotationAnchor::Revision { commit_id, .. }
            | AnnotationAnchor::Bookmark { commit_id, .. }
            | AnnotationAnchor::File { commit_id, .. }
            | AnnotationAnchor::Lines { commit_id, .. } => commit_id,
        }
    }

    pub fn path(&self) -> Option<&str> {
        match self {
            AnnotationAnchor::File { path, .. } | AnnotationAnchor::Lines { path, .. } => {
                Some(path)
            }
            _ => None,
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
#[cfg_attr(feature = "ts-rs", derive(TS), ts(export, export_to = "app/messages/"))]
pub enum LineSide {
    /// the revision's parent, i.e. removed lines
    Old,
    /// the revision itself, i.e. added or unchanged lines
    New,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
#[cfg_attr(feature = "ts-rs", derive(TS), ts(export, export_to = "app/messages/"))]
pub enum AuthorKind {
    Human,
    Agent,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[cfg_attr(feature = "ts-rs", derive(TS), ts(export, export_to = "app/messages/"))]
pub struct AnnotationAuthor {
    pub name: String,
    pub kind: AuthorKind,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
#[cfg_attr(feature = "ts-rs", derive(TS), ts(export, export_to = "app/messages/"))]
pub enum AnnotationStatus {
    Open,
    Resolved,
}

/// How the anchor relates to the repository as it is now.
#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(tag = "type", rename_all = "snake_case")]
#[cfg_attr(feature = "ts-rs", derive(TS), ts(export, export_to = "app/messages/"))]
pub enum AnchorState {
    /// the annotated commit is still the change's current version
    Current,
    /// the change was rewritten; `matches` says whether annotated lines are
    /// still found at the same place in the new version
    Rewritten {
        commit_id: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        #[cfg_attr(feature = "ts-rs", ts(optional))]
        matches: Option<bool>,
    },
    /// the change no longer exists in this repository
    Missing,
    /// the repository wasn't consulted
    Unknown,
}

#[derive(Serialize, Clone, Debug)]
#[cfg_attr(feature = "ts-rs", derive(TS), ts(export, export_to = "app/messages/"))]
pub struct AnnotationPost {
    pub id: String,
    pub author: AnnotationAuthor,
    pub created_at: DateTime<Utc>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts-rs", ts(optional))]
    pub edited_at: Option<DateTime<Utc>>,
    pub body: String,
}

/// An annotation with its posts and current status, assembled from events.
#[derive(Serialize, Clone, Debug)]
#[cfg_attr(feature = "ts-rs", derive(TS), ts(export, export_to = "app/messages/"))]
pub struct AnnotationThread {
    pub id: String,
    /// everything the note points at, in the order it was added
    pub targets: Vec<AnnotationTarget>,
    pub workspace: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub status: AnnotationStatus,
    pub posts: Vec<AnnotationPost>,
}

/// A place a note points at, as given when annotating.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[cfg_attr(feature = "ts-rs", derive(TS), ts(export, export_to = "app/messages/"))]
pub struct TargetInput {
    pub anchor: AnnotationAnchor,
    /// the revision's summary line at the time, for context in exports
    #[serde(default)]
    pub subject: String,
}

/// A place a note points at, with how it relates to the repository now.
#[derive(Serialize, Clone, Debug)]
#[cfg_attr(feature = "ts-rs", derive(TS), ts(export, export_to = "app/messages/"))]
pub struct AnnotationTarget {
    pub anchor: AnnotationAnchor,
    pub subject: String,
    pub state: AnchorState,
}

#[derive(Serialize, Clone, Debug)]
#[cfg_attr(feature = "ts-rs", derive(TS), ts(export, export_to = "app/messages/"))]
pub struct AnnotationList {
    /// where the notes are stored, so people can find, back up or delete them
    pub location: String,
    /// who the app writes as, so it can offer to edit that person's posts
    pub me: AnnotationAuthor,
    pub threads: Vec<AnnotationThread>,
}

/// Requests from the app. Every request answers with the refreshed list,
/// except `Export`, which answers with markdown.
#[derive(Deserialize, Debug)]
#[serde(tag = "type")]
#[cfg_attr(feature = "ts-rs", derive(TS), ts(export, export_to = "app/messages/"))]
pub enum AnnotationRequest {
    List,
    Create {
        targets: Vec<TargetInput>,
        body: String,
    },
    /// points an existing note at more places
    AddTargets {
        id: String,
        targets: Vec<TargetInput>,
    },
    RemoveTarget {
        id: String,
        anchor: AnnotationAnchor,
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
    Delete {
        ids: Vec<String>,
    },
}
