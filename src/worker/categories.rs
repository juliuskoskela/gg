use std::{collections::HashMap, path::Path};

use anyhow::Result;
use futures_util::AsyncReadExt;
use gix::{attrs, bstr::ByteSlice};
use jj_lib::{backend::TreeValue, merged_tree::MergedTree, repo_path::RepoPath};

use crate::messages::queries::FileCategory;

#[derive(Clone, Default)]
struct Rules {
    search: attrs::Search,
    metadata: attrs::search::MetadataCollection,
}

impl Rules {
    fn add(&mut self, directory: &str, contents: &[u8]) {
        self.search.add_patterns_buffer(
            contents,
            Path::new(directory).join(".gitattributes"),
            Some(Path::new("")),
            &mut self.metadata,
            directory.is_empty(),
        );
    }

    fn category(&self, path: &str) -> FileCategory {
        let mut outcome = attrs::search::Outcome::default();
        outcome.initialize(&self.metadata);
        self.search.pattern_matching_relative_path(
            path.as_bytes().as_bstr(),
            gix::glob::pattern::Case::Sensitive,
            Some(false),
            &mut outcome,
        );
        let enabled = |name: &str| {
            outcome.iter().any(|matched| {
                matched.assignment.name.as_str() == name
                    && (matches!(matched.assignment.state, attrs::StateRef::Set)
                        || matches!(matched.assignment.state, attrs::StateRef::Value(value) if value.as_bstr() == b"true"))
            })
        };
        // explicit review attributes take precedence over linguist fallbacks
        for (name, category) in [
            ("review-implementation", FileCategory::Implementation),
            ("review-generated", FileCategory::Generated),
            ("review-agent-guidance", FileCategory::AgentGuidance),
            ("review-test", FileCategory::Test),
            ("review-documentation", FileCategory::Documentation),
            ("review-localization", FileCategory::Localization),
            ("review-assets", FileCategory::Assets),
            ("linguist-generated", FileCategory::Generated),
            ("linguist-documentation", FileCategory::Documentation),
        ] {
            if enabled(name) {
                return category;
            }
        }
        FileCategory::Implementation
    }
}

/// Reads only committed attributes, never local or global Git configuration.
pub(super) struct FileCategories<'a> {
    tree: &'a MergedTree,
    directories: HashMap<String, Rules>,
}

impl<'a> FileCategories<'a> {
    pub fn new(tree: &'a MergedTree) -> Self {
        Self {
            tree,
            directories: HashMap::new(),
        }
    }

    pub async fn category(&mut self, path: &RepoPath) -> Result<FileCategory> {
        let path = path.as_internal_file_string();
        let directory = path.rsplit_once('/').map_or("", |(directory, _)| directory);
        if !self.directories.contains_key(directory) {
            let mut rules = Rules::default();
            let mut prefixes = vec![""];
            prefixes.extend(
                directory
                    .match_indices('/')
                    .map(|(index, _)| &directory[..index]),
            );
            if !directory.is_empty() {
                prefixes.push(directory);
            }
            for prefix in prefixes {
                if let Some(cached) = self.directories.get(prefix) {
                    rules = cached.clone();
                    continue;
                }
                let attributes = if prefix.is_empty() {
                    ".gitattributes".to_owned()
                } else {
                    format!("{prefix}/.gitattributes")
                };
                let attribute_path = RepoPath::from_internal_string(&attributes)?;
                let value = self.tree.path_value(attribute_path).await?;
                // symlinks and conflicted attribute files are not executable policy
                if let Some(Some(TreeValue::File { id, .. })) = value.as_resolved() {
                    let mut reader = self.tree.store().read_file(attribute_path, id).await?;
                    let mut bytes = Vec::new();
                    reader.read_to_end(&mut bytes).await?;
                    rules.add(prefix, &bytes);
                }
                self.directories.insert(prefix.to_owned(), rules.clone());
            }
        }
        Ok(self.directories[directory].category(path))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn git_patterns_overrides_and_macros() {
        let mut rules = Rules::default();
        rules.add("", b"[attr]tests review-test\n*.rs tests\ndocs/** review-documentation=true\nassets/ review-assets\n\"with space.txt\" review-generated\n");
        rules.add(
            "src",
            b"*.rs -review-test review-documentation\nmain.rs !review-documentation\n",
        );
        assert_eq!(rules.category("tests/a.rs"), FileCategory::Test);
        assert_eq!(rules.category("src/lib.rs"), FileCategory::Documentation);
        assert_eq!(rules.category("src/main.rs"), FileCategory::Implementation);
        assert_eq!(
            rules.category("docs/nested/a.md"),
            FileCategory::Documentation
        );
        assert_eq!(rules.category("assets/a.png"), FileCategory::Implementation);
        assert_eq!(rules.category("with space.txt"), FileCategory::Generated);
    }

    #[test]
    fn explicit_categories_precede_fallbacks_and_false_is_unset() {
        let mut rules = Rules::default();
        rules.add("", b"* linguist-generated\n*.rs review-test=true\nmain.rs review-implementation\na.txt linguist-generated=false linguist-documentation\nb.txt !linguist-generated\nc.txt review-test=false -linguist-generated\n");
        assert_eq!(rules.category("test.rs"), FileCategory::Test);
        assert_eq!(rules.category("main.rs"), FileCategory::Implementation);
        assert_eq!(rules.category("a.txt"), FileCategory::Documentation);
        assert_eq!(rules.category("b.txt"), FileCategory::Implementation);
        assert_eq!(rules.category("c.txt"), FileCategory::Implementation);
    }
}
