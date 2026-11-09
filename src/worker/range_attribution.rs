use anyhow::Result;
use futures_util::AsyncReadExt;
use jj_lib::{
    backend::TreeValue, commit::Commit, merged_tree::MergedTree, repo_path::RepoPath, rewrite,
};

use super::{WorkspaceSession, range_provenance::Provenance};
use crate::messages::{HunkProvenance, LineProvenance, RevId, queries::RevChange};

struct Step {
    id: RevId,
    before: MergedTree,
    after: MergedTree,
}

pub(super) struct RangeAttribution {
    steps: Vec<Step>,
    pub unavailable: Option<String>,
}

impl RangeAttribution {
    pub async fn new(ws: &WorkspaceSession<'_>, newest_first: &[Commit]) -> Result<Self> {
        let linear = newest_first.len() < 2
            || newest_first
                .windows(2)
                .all(|pair| pair[0].parent_ids() == [pair[1].id().clone()])
                && newest_first
                    .last()
                    .is_some_and(|commit| commit.parent_ids().len() == 1);
        if !linear {
            return Ok(Self { steps: Vec::new(), unavailable: Some("This selection is not a linear stack. Open each change to review its own diff.".into()) });
        }
        let mut steps = Vec::new();
        for commit in newest_first.iter().rev() {
            steps.push(Step {
                id: ws.format_id(commit),
                before: rewrite::merge_commit_trees(ws.repo(), &commit.parents().await?).await?,
                after: commit.tree(),
            });
        }
        Ok(Self {
            steps,
            unavailable: None,
        })
    }

    pub async fn file_origin(&self, path: &RepoPath) -> Result<Option<RevId>> {
        for step in self.steps.iter().rev() {
            if step.before.path_value(path).await? != step.after.path_value(path).await? {
                return Ok(Some(step.id.clone()));
            }
        }
        Ok(None)
    }

    pub async fn annotate(&self, change: &mut RevChange) -> Result<()> {
        let path = RepoPath::from_internal_string(&change.path.repo_path)?;
        change.origin = self.file_origin(path).await?;
        if self.steps.len() < 2 {
            return Ok(());
        }
        let Some(first) = self.steps.first() else {
            return Ok(());
        };
        let Some(base) = plain_file(&first.before, path).await? else {
            return Ok(());
        };
        let mut history = Provenance::new(&base);
        for (index, step) in self.steps.iter().enumerate() {
            let Some(contents) = plain_file(&step.after, path).await? else {
                return Ok(());
            };
            history.apply(index, &contents);
        }
        for hunk in &mut change.hunks {
            let mut old = hunk.location.from_file.start;
            let mut new = hunk.location.to_file.start;
            let mut lines: Vec<LineProvenance> = Vec::new();
            let mut latest = None;
            let mut complete = true;
            for text in &hunk.lines.lines {
                let added = text.starts_with('+');
                let removed = text.starts_with('-');
                if added || removed {
                    let (line, source) = if added {
                        (new, history.added(new))
                    } else {
                        (old, history.removed(old))
                    };
                    if let Some(source) = source {
                        latest =
                            Some(latest.map_or(source.step, |index: usize| index.max(source.step)));
                        let origin = &self.steps[source.step].id;
                        if let Some(previous) = lines.last_mut()
                            && previous.added == added
                            && previous.origin == *origin
                            && previous.line + previous.len == line
                            && previous.origin_line + previous.len == source.line
                        {
                            previous.len += 1;
                        } else {
                            lines.push(LineProvenance {
                                added,
                                line,
                                len: 1,
                                origin: origin.clone(),
                                origin_line: source.line,
                            });
                        }
                    } else {
                        complete = false;
                    }
                }
                if text.starts_with(' ') || removed {
                    old += 1;
                }
                if text.starts_with(' ') || added {
                    new += 1;
                }
            }
            if complete && let Some(index) = latest {
                hunk.provenance = Some(HunkProvenance {
                    origin: self.steps[index].id.clone(),
                    lines,
                });
            }
        }
        Ok(())
    }
}

async fn plain_file(tree: &MergedTree, path: &RepoPath) -> Result<Option<Vec<u8>>> {
    let value = tree.path_value(path).await?;
    match value.as_resolved() {
        Some(None) => Ok(Some(Vec::new())),
        Some(Some(TreeValue::File { id, .. })) => {
            let mut bytes = Vec::new();
            tree.store()
                .read_file(path, id)
                .await?
                .read_to_end(&mut bytes)
                .await?;
            Ok((!bytes.contains(&0) && std::str::from_utf8(&bytes).is_ok()).then_some(bytes))
        }
        _ => Ok(None),
    }
}
