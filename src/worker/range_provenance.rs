use jj_lib::diff::{ContentDiff, DiffHunkKind};

#[derive(Clone, Debug, PartialEq, Eq)]
pub(super) struct SourceLine {
    pub step: usize,
    pub line: usize,
}

#[derive(Clone)]
struct TrackedLine {
    base: Option<usize>,
    source: Option<SourceLine>,
}

/// Carries original coordinates through edits, rather than assigning an entire file's owner to every hunk.
pub(super) struct Provenance {
    base: Vec<u8>,
    previous: Vec<u8>,
    current: Vec<TrackedLine>,
    removed: Vec<Option<SourceLine>>,
}

impl Provenance {
    pub fn new(base: &[u8]) -> Self {
        let count = base.split_inclusive(|byte| *byte == b'\n').count();
        Self {
            base: base.to_vec(),
            previous: base.to_vec(),
            current: (0..count)
                .map(|index| TrackedLine {
                    base: Some(index),
                    source: None,
                })
                .collect(),
            removed: vec![None; count],
        }
    }

    pub fn apply(&mut self, step: usize, contents: &[u8]) {
        let mut next = Vec::new();
        let mut old_line = 0;
        let mut new_line = 0;
        for hunk in ContentDiff::by_line([self.previous.as_slice(), contents]).hunks() {
            let old_count = hunk.contents[0]
                .split_inclusive(|byte| *byte == b'\n')
                .count();
            let new_count = hunk.contents[1]
                .split_inclusive(|byte| *byte == b'\n')
                .count();
            match hunk.kind {
                DiffHunkKind::Matching => {
                    next.extend_from_slice(&self.current[old_line..old_line + old_count])
                }
                DiffHunkKind::Different => {
                    next.extend((0..new_count).map(|offset| TrackedLine {
                        base: None,
                        source: Some(SourceLine {
                            step,
                            line: new_line + offset + 1,
                        }),
                    }));
                }
            }
            old_line += old_count;
            new_line += new_count;
        }
        // re-associate restored lines with the base, so a later removal belongs to its latest remover
        let mut previous_positions = vec![None; self.removed.len()];
        for (index, tracked) in self.current.iter().enumerate() {
            if let Some(base) = tracked.base {
                previous_positions[base] = Some(index);
            }
        }
        let mut present = vec![false; self.removed.len()];
        let mut base_line = 0;
        let mut next_line = 0;
        for hunk in ContentDiff::by_line([self.base.as_slice(), contents]).hunks() {
            let base_count = hunk.contents[0]
                .split_inclusive(|byte| *byte == b'\n')
                .count();
            let next_count = hunk.contents[1]
                .split_inclusive(|byte| *byte == b'\n')
                .count();
            for offset in 0..next_count {
                let tracked = &mut next[next_line + offset];
                if hunk.kind == DiffHunkKind::Matching {
                    let base = base_line + offset;
                    tracked.base = Some(base);
                    present[base] = true;
                    self.removed[base] = None;
                } else {
                    tracked.base = None;
                    if tracked.source.is_none() {
                        tracked.source = Some(SourceLine {
                            step,
                            line: next_line + offset + 1,
                        });
                    }
                }
            }
            base_line += base_count;
            next_line += next_count;
        }
        for (base, old_position) in previous_positions.into_iter().enumerate() {
            if !present[base]
                && let Some(position) = old_position
            {
                self.removed[base] = Some(SourceLine {
                    step,
                    line: position + 1,
                });
            }
        }
        self.current = next;
        self.previous = contents.to_vec();
    }

    pub fn added(&self, line: usize) -> Option<&SourceLine> {
        self.current.get(line.checked_sub(1)?)?.source.as_ref()
    }

    pub fn removed(&self, line: usize) -> Option<&SourceLine> {
        self.removed.get(line.checked_sub(1)?)?.as_ref()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn independent_hunks_keep_their_own_origins_after_line_shifts() {
        let mut history = Provenance::new(b"a\nb\nc\nd\n");
        history.apply(0, b"a\nfirst\nb\nc\nd\n");
        history.apply(1, b"prefix\na\nfirst\nb\nc\nlast\n");
        assert_eq!(history.added(3), Some(&SourceLine { step: 0, line: 2 }));
        assert_eq!(history.added(1), Some(&SourceLine { step: 1, line: 1 }));
        assert_eq!(history.added(6), Some(&SourceLine { step: 1, line: 6 }));
        assert_eq!(history.removed(4), Some(&SourceLine { step: 1, line: 5 }));
    }

    #[test]
    fn replacing_an_earlier_addition_does_not_reassign_an_original_deletion() {
        let mut history = Provenance::new(b"old\ncontext\n");
        history.apply(0, b"temporary\ncontext\n");
        history.apply(1, b"final\ncontext\n");
        assert_eq!(history.removed(1), Some(&SourceLine { step: 0, line: 1 }));
        assert_eq!(history.added(1), Some(&SourceLine { step: 1, line: 1 }));
    }

    #[test]
    fn additions_reverted_later_leave_no_surviving_attribution() {
        let mut history = Provenance::new(b"unchanged\n");
        history.apply(0, b"added\nunchanged\n");
        history.apply(1, b"unchanged\n");
        assert_eq!(history.added(1), None);
        assert_eq!(history.removed(1), None);
    }
    #[test]
    fn removing_a_restored_line_uses_the_last_remover() {
        let mut history = Provenance::new(b"base\ncontext\n");
        history.apply(0, b"context\n");
        history.apply(1, b"base\ncontext\n");
        history.apply(2, b"context\n");
        assert_eq!(history.removed(1), Some(&SourceLine { step: 2, line: 1 }));
    }
}
