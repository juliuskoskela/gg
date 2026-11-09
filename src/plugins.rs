//! Namespaced local data for bundled plugins; never repository contents.
use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
};

use anyhow::{Result, bail};
use chrono::Utc;
use tempfile::NamedTempFile;

use crate::{
    annotations,
    messages::plugins::{PluginData, PluginFact, PluginOperation, PluginRequest},
};

const MAX_VALUE_BYTES: usize = 4 * 1024 * 1024;
const FACT_PAGE: usize = 100;

fn valid_name(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 128
        && value.as_bytes()[0].is_ascii_alphanumeric()
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || b"._-".contains(&byte))
        && !value.contains("..")
}

pub struct PluginStore {
    root: PathBuf,
}

impl PluginStore {
    pub fn for_workspace(repo: &Path, workspace: &Path, expected: &str) -> Result<Self> {
        if workspace.to_string_lossy() != expected {
            bail!("Plugin request belongs to a different workspace");
        }
        Ok(Self::at(
            annotations::data_root()?
                .join("repos")
                .join(annotations::repo_key(repo))
                .join("plugins"),
        ))
    }

    pub fn at(root: PathBuf) -> Self {
        Self { root }
    }

    pub fn handle(&self, request: PluginRequest) -> Result<PluginData> {
        if !valid_name(&request.plugin) {
            bail!("Invalid plugin identifier");
        }
        let directory = self.root.join(&request.plugin);
        let mut result = PluginData::default();
        match request.operation {
            PluginOperation::Get { key } => {
                let path = value_path(&directory, &key)?;
                result.value = match fs::read(path) {
                    Ok(bytes) => Some(serde_json::from_slice(&bytes)?),
                    Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
                    Err(error) => return Err(error.into()),
                };
            }
            PluginOperation::Set { key, value } => {
                let path = value_path(&directory, &key)?;
                atomic_write(&path, &value, true)?;
            }
            PluginOperation::Delete { key } => {
                match fs::remove_file(value_path(&directory, &key)?) {
                    Ok(()) => {}
                    Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
                    Err(error) => return Err(error.into()),
                }
            }
            PluginOperation::Keys => {
                let entries = match fs::read_dir(directory.join("values")) {
                    Ok(entries) => Some(entries),
                    Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
                    Err(error) => return Err(error.into()),
                };
                if let Some(entries) = entries {
                    for entry in entries {
                        let entry = entry?;
                        if entry.file_type()?.is_file()
                            && entry
                                .path()
                                .extension()
                                .is_some_and(|extension| extension == "json")
                        {
                            result.keys.push(
                                entry
                                    .path()
                                    .file_stem()
                                    .unwrap()
                                    .to_string_lossy()
                                    .into_owned(),
                            );
                        }
                    }
                    result.keys.sort();
                }
            }
            PluginOperation::Publish { kind, data } => {
                if !valid_name(&kind) {
                    bail!("Invalid plugin fact kind");
                }
                let now = Utc::now();
                let fact = PluginFact {
                    id: format!(
                        "{:020}-{}",
                        now.timestamp_micros(),
                        uuid::Uuid::new_v4().simple()
                    ),
                    plugin: request.plugin,
                    kind,
                    at: now.to_rfc3339(),
                    data,
                };
                atomic_write(
                    &directory.join("facts").join(format!("{}.json", fact.id)),
                    &fact,
                    false,
                )?;
                result.facts.push(fact);
            }
            PluginOperation::Facts { after } => {
                let mut paths = match fs::read_dir(directory.join("facts")) {
                    Ok(entries) => entries
                        .map(|entry| entry.map(|entry| entry.path()))
                        .collect::<std::io::Result<Vec<_>>>()?,
                    Err(error) if error.kind() == std::io::ErrorKind::NotFound => Vec::new(),
                    Err(error) => return Err(error.into()),
                };
                paths.sort();
                for path in paths {
                    if path.extension().is_none_or(|extension| extension != "json") {
                        continue;
                    }
                    let fact: PluginFact = serde_json::from_slice(&fs::read(path)?)?;
                    if after.as_ref().is_none_or(|after| fact.id > *after) {
                        result.facts.push(fact);
                        if result.facts.len() == FACT_PAGE {
                            break;
                        }
                    }
                }
            }
        }
        Ok(result)
    }
}

fn value_path(directory: &Path, key: &str) -> Result<PathBuf> {
    if !valid_name(key) {
        bail!("Invalid plugin storage key");
    }
    Ok(directory.join("values").join(format!("{key}.json")))
}

fn atomic_write(path: &Path, value: &impl serde::Serialize, replace: bool) -> Result<()> {
    let bytes = serde_json::to_vec(value)?;
    if bytes.len() > MAX_VALUE_BYTES {
        bail!("Plugin data exceeds the 4 MiB limit");
    }
    let parent = path.parent().unwrap();
    fs::create_dir_all(parent)?;
    let mut file = NamedTempFile::new_in(parent)?;
    file.write_all(&bytes)?;
    file.as_file().sync_all()?;
    if replace {
        file.persist(path)?;
    } else {
        file.persist_noclobber(path)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn request(plugin: &str, operation: PluginOperation) -> PluginRequest {
        PluginRequest {
            plugin: plugin.into(),
            workspace: String::new(),
            operation,
        }
    }

    #[test]
    fn rejects_requests_from_a_previous_workspace() {
        assert!(
            PluginStore::for_workspace(
                Path::new("/repo"),
                Path::new("/workspace-b"),
                "/workspace-a"
            )
            .is_err()
        );
    }

    #[test]
    fn isolated_storage_and_atomic_replacement() -> Result<()> {
        let directory = tempfile::tempdir()?;
        let store = PluginStore::at(directory.path().join("plugins"));
        store.handle(request(
            "review",
            PluginOperation::Set {
                key: "queue".into(),
                value: json!([1]),
            },
        ))?;
        store.handle(request(
            "review",
            PluginOperation::Set {
                key: "queue".into(),
                value: json!([2]),
            },
        ))?;
        assert_eq!(
            store
                .handle(request(
                    "review",
                    PluginOperation::Get {
                        key: "queue".into()
                    }
                ))?
                .value,
            Some(json!([2]))
        );
        assert!(
            store
                .handle(request(
                    "other",
                    PluginOperation::Get {
                        key: "queue".into()
                    }
                ))?
                .value
                .is_none()
        );
        assert_eq!(
            store.handle(request("review", PluginOperation::Keys))?.keys,
            vec!["queue"]
        );
        store.handle(request(
            "review",
            PluginOperation::Delete {
                key: "queue".into(),
            },
        ))?;
        assert!(
            store
                .handle(request("review", PluginOperation::Keys))?
                .keys
                .is_empty()
        );
        Ok(())
    }

    #[test]
    fn rejects_paths_and_oversized_values_without_writing() -> Result<()> {
        let directory = tempfile::tempdir()?;
        let store = PluginStore::at(directory.path().join("plugins"));
        for name in ["../escape", "/tmp", "a/b", "a\\b", "..", ""] {
            assert!(store.handle(request(name, PluginOperation::Keys)).is_err());
            assert!(
                store
                    .handle(request(
                        "review",
                        PluginOperation::Set {
                            key: name.into(),
                            value: json!(1)
                        }
                    ))
                    .is_err()
            );
        }
        assert!(
            store
                .handle(request(
                    "review",
                    PluginOperation::Set {
                        key: "large".into(),
                        value: json!("x".repeat(MAX_VALUE_BYTES))
                    }
                ))
                .is_err()
        );
        assert!(!directory.path().join("plugins").exists());
        Ok(())
    }

    #[test]
    fn facts_are_append_only_and_cursor_paged() -> Result<()> {
        let directory = tempfile::tempdir()?;
        let store = PluginStore::at(directory.path().to_owned());
        let first = store
            .handle(request(
                "review",
                PluginOperation::Publish {
                    kind: "merged-upstream".into(),
                    data: json!({"change":"abc"}),
                },
            ))?
            .facts
            .remove(0);
        let second = store
            .handle(request(
                "review",
                PluginOperation::Publish {
                    kind: "review-complete".into(),
                    data: json!(true),
                },
            ))?
            .facts
            .remove(0);
        let page = store.handle(request(
            "review",
            PluginOperation::Facts {
                after: Some(first.id),
            },
        ))?;
        assert_eq!(page.facts.len(), 1);
        assert_eq!(page.facts[0].id, second.id);
        assert!(
            store
                .handle(request("other", PluginOperation::Facts { after: None }))?
                .facts
                .is_empty()
        );
        Ok(())
    }
}
