use anyhow::Result;
use jj_lib::object_id::ObjectId as _;

use super::{get_by_chid, mkrepo, revs};
use crate::{
    messages::{
        annotations::{AnchorState, AnnotationAnchor, AnnotationRequest, LineSide},
        mutations::DescribeRevision,
    },
    worker::{Mutation as _, WorkerSession, annotations},
};

#[tokio::test]
async fn anchors_report_rewrites_and_moved_lines() -> Result<()> {
    let data = tempfile::tempdir()?;
    // the only test touching the data directory, so the process-wide override can't race
    unsafe { std::env::set_var("GG_DATA_DIR", data.path()) };

    let directory = mkrepo();
    let mut session = WorkerSession::default();
    let mut ws = session.load_workspace(directory.path()).await?;
    let commit = get_by_chid(&ws, &revs::working_copy())?;
    let anchor = |start: u32, quote: &str| AnnotationAnchor::Lines {
        change_id: commit.change_id().reverse_hex(),
        commit_id: commit.id().hex(),
        path: "a.txt".into(),
        side: LineSide::New,
        start,
        end: start + 1,
        quote: quote.into(),
    };
    for (start, quote) in [(1, "1\n2"), (1, "something else")] {
        annotations::handle(
            &ws,
            AnnotationRequest::Create {
                anchor: anchor(start, quote),
                subject: "".into(),
                body: format!("note on {quote}"),
            },
        )?;
    }
    let list = annotations::handle(&ws, AnnotationRequest::List)?;
    assert_eq!(list.threads.len(), 2);
    assert!(
        list.location
            .starts_with(&data.path().display().to_string())
    );
    assert!(list.threads.iter().all(|t| t.state == AnchorState::Current));
    assert_eq!(list.threads[0].workspace, "default");

    DescribeRevision {
        id: revs::working_copy(),
        new_description: "rewritten".into(),
        reset_author: false,
    }
    .execute_unboxed(&mut ws)
    .await?;

    let list = annotations::handle(&ws, AnnotationRequest::List)?;
    let state = |body: &str| {
        list.threads
            .iter()
            .find(|t| t.posts[0].body == body)
            .map(|t| t.state.clone())
            .unwrap()
    };
    assert!(matches!(
        state("note on 1\n2"),
        AnchorState::Rewritten {
            matches: Some(true),
            ..
        }
    ));
    assert!(matches!(
        state("note on something else"),
        AnchorState::Rewritten {
            matches: Some(false),
            ..
        }
    ));

    let markdown = annotations::export(&ws, vec![list.threads[0].id.clone()])?;
    assert!(markdown.contains("has been rewritten since"));

    let ids = list.threads.iter().map(|t| t.id.clone()).collect();
    let list = annotations::handle(&ws, AnnotationRequest::Delete { ids })?;
    assert!(list.threads.is_empty());
    Ok(())
}
