//! Agent claims stay attached to their post, separate from edit-author identity.
use anyhow::{Result, ensure};
use serde_json::{Value, json};

use crate::messages::annotation_agents::AnnotationMetadata;

pub fn validate(metadata: &AnnotationMetadata) -> Result<()> {
    if let Some(identity) = &metadata.on_behalf_of {
        ensure!(
            !identity.agent.trim().is_empty() && identity.agent.chars().count() <= 200,
            "Agent must contain 1–200 characters"
        );
        if let Some(model) = &identity.model {
            ensure!(
                model.chars().count() <= 200,
                "Model must contain at most 200 characters"
            );
        }
    }
    if let Some(risk) = &metadata.risk_score {
        ensure!(
            (1..=4).contains(&risk.level),
            "Risk level must be between 1 and 4"
        );
        if let Some(sha) = &risk.sha {
            ensure!(
                sha.len() == 40 && sha.bytes().all(|byte| byte.is_ascii_hexdigit()),
                "Risk SHA must be a 40-character commit SHA"
            );
        }
        let explanations = risk.explanations.as_deref().unwrap_or_default();
        ensure!(
            explanations.len() <= 8,
            "At most 8 risk explanations are supported"
        );
        ensure!(
            explanations
                .iter()
                .all(|text| !text.trim().is_empty() && text.chars().count() <= 200),
            "Risk explanations must contain 1–200 characters"
        );
    }
    Ok(())
}

pub fn linear_extension(metadata: &AnnotationMetadata) -> String {
    let mut plugins: Vec<Value> = Vec::new();
    if let Some(identity) = &metadata.on_behalf_of {
        let mut plugin = serde_json::to_value(identity).expect("identity serializes");
        plugin["plugin"] = json!("onBehalfOf");
        plugins.push(plugin);
    }
    if let Some(risk) = &metadata.risk_score {
        let mut plugin = serde_json::to_value(risk).expect("risk serializes");
        plugin["plugin"] = json!("riskScore");
        plugins.push(plugin);
    }
    if plugins.is_empty() {
        return String::new();
    }
    // metadata strings must not terminate the HTML comment that carries them.
    let json = json!({ "version": 1, "plugins": plugins })
        .to_string()
        .replace('<', "\\u003c")
        .replace('>', "\\u003e")
        .replace('&', "\\u0026");
    format!("<!-- linear:extension {json} -->")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        annotations::AnnotationStore,
        messages::{
            annotation_agents::{AgentIdentity, AgentRiskScore},
            annotation_exchange::{AnnotationContext, AnnotationEvent, AnnotationEventKind},
            annotations::{AnnotationAnchor, AnnotationAuthor, AuthorKind, TargetInput},
        },
    };

    fn metadata() -> AnnotationMetadata {
        AnnotationMetadata {
            on_behalf_of: Some(AgentIdentity {
                agent: "codex".into(),
                model: Some("gpt-test".into()),
            }),
            risk_score: Some(AgentRiskScore {
                level: 3,
                sha: Some("a".repeat(40)),
                explanations: Some(vec!["Touches authentication".into()]),
            }),
        }
    }
    #[test]
    fn validates_documented_metadata_limits() {
        assert!(validate(&metadata()).is_ok());
        let mut value = metadata();
        value.risk_score.as_mut().unwrap().level = 0;
        assert!(validate(&value).is_err());
        value = metadata();
        value.risk_score.as_mut().unwrap().level = 5;
        assert!(validate(&value).is_err());
        value = metadata();
        value.risk_score.as_mut().unwrap().sha = Some("a".repeat(64));
        assert!(validate(&value).is_err());
        value = metadata();
        value.risk_score.as_mut().unwrap().explanations = Some(vec!["reason".into(); 9]);
        assert!(validate(&value).is_err());
        value = metadata();
        value.risk_score.as_mut().unwrap().explanations = Some(vec![" ".into()]);
        assert!(validate(&value).is_err());
        value = metadata();
        value.on_behalf_of.as_mut().unwrap().model = Some("x".repeat(201));
        assert!(validate(&value).is_err());
        value = metadata();
        value.on_behalf_of.as_mut().unwrap().model = Some("é".repeat(200));
        assert!(validate(&value).is_ok());
    }
    #[test]
    fn legacy_posts_have_no_metadata() -> Result<()> {
        let event: AnnotationEvent = serde_json::from_value(
            json!({ "id": "legacy", "at": "2026-01-01T00:00:00Z", "author": {"name":"old", "kind":"agent"}, "type":"post", "body":"Legacy reply" }),
        )?;
        assert!(matches!(
            &event.kind,
            AnnotationEventKind::Post { metadata: None, .. }
        ));
        assert!(!serde_json::to_string(&event)?.contains("metadata"));
        Ok(())
    }
    #[test]
    fn extension_uses_linear_fields_without_escaping_the_html_comment() -> Result<()> {
        let mut value = metadata();
        value.on_behalf_of.as_mut().unwrap().model = Some("test --> <script>".into());
        let extension = linear_extension(&value);
        assert_eq!(extension.matches("-->").count(), 1);
        let parsed: Value = serde_json::from_str(
            extension
                .strip_prefix("<!-- linear:extension ")
                .unwrap()
                .strip_suffix(" -->")
                .unwrap(),
        )?;
        assert_eq!(parsed["version"], 1);
        assert_eq!(parsed["plugins"][0]["plugin"], "onBehalfOf");
        assert_eq!(parsed["plugins"][0]["model"], "test --> <script>");
        assert_eq!(parsed["plugins"][1]["plugin"], "riskScore");
        assert_eq!(parsed["plugins"][1]["level"], 3);
        Ok(())
    }
    #[test]
    fn metadata_survives_edits_and_bundle_exchange_without_changing_authorship() -> Result<()> {
        let directory = tempfile::tempdir()?;
        let source = AnnotationStore::at(directory.path().join("source"));
        let target = AnnotationStore::at(directory.path().join("target"));
        let scope = AnnotationContext {
            plugin: "review".into(),
            id: "session".into(),
        };
        let human = AnnotationAuthor {
            name: "Reviewer".into(),
            kind: AuthorKind::Human,
        };
        let agent = AnnotationAuthor {
            name: "codex".into(),
            kind: AuthorKind::Agent,
        };
        let note = source.create_in_context(
            vec![TargetInput {
                anchor: AnnotationAnchor::Revision {
                    change_id: "abc".into(),
                    commit_id: "123".into(),
                },
                subject: "Change".into(),
            }],
            "default",
            human,
            "Question",
            scope.clone(),
        )?;
        let replied =
            source.reply_with_metadata(&note.id, agent.clone(), "Answer", Some(metadata()))?;
        let post = &replied.posts[1];
        source.edit(&note.id, &post.id, agent.clone(), "Refined answer")?;
        let edited = source.get(&note.id)?;
        assert_eq!(edited.posts[1].metadata, Some(metadata()));
        assert_eq!(edited.posts[1].author, agent);
        assert!(crate::annotations::export_markdown(&[edited]).contains("linear:extension"));
        let bundle = source.export_context(&scope)?;
        let json = serde_json::to_vec(&bundle)?;
        target.import_context(&scope, serde_json::from_slice(&json)?)?;
        let restored = target.get(&note.id)?;
        assert_eq!(restored.posts[1].metadata, Some(metadata()));
        assert_eq!(restored.posts[1].body, "Refined answer");
        Ok(())
    }
}
