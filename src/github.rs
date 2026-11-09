//! Fixed-host, unauthenticated public reads, independent of the repository worker.
use std::{
    collections::VecDeque,
    sync::LazyLock,
    time::{Duration, Instant},
};

use anyhow::{Result, bail, ensure};
use serde_json::Value;
use tauri_plugin_http::reqwest::{self, Client, header};
use tokio::sync::Mutex;

use crate::messages::github::{GithubEndpoint, GithubPull, GithubRequest, GithubResponse};

static REQUESTS: LazyLock<Mutex<VecDeque<Instant>>> = LazyLock::new(|| Mutex::new(VecDeque::new()));
const MAX_BYTES: usize = 5 * 1024 * 1024;

fn path(request: &GithubRequest) -> Result<String> {
    for name in [&request.owner, &request.repo] {
        ensure!(
            !name.is_empty()
                && name.len() <= 100
                && name
                    .bytes()
                    .all(|c| c.is_ascii_alphanumeric() || b"-_.".contains(&c))
                && name != "."
                && name != "..",
            "Invalid GitHub repository name"
        );
    }
    if let Some(etag) = &request.etag {
        ensure!(
            etag.len() <= 256 && etag.bytes().all(|c| (32..=126).contains(&c)),
            "Invalid cache validator"
        );
    }
    let base = format!("/repos/{}/{}/pulls", request.owner, request.repo);
    Ok(match request.endpoint {
        GithubEndpoint::List { page } => {
            ensure!((1..=3).contains(&page), "Only three pages may be read");
            format!("{base}?state=open&sort=updated&direction=desc&per_page=100&page={page}")
        }
        GithubEndpoint::Pull { number } => {
            ensure!(number > 0, "Invalid pull request number");
            format!("{base}/{number}")
        }
    })
}

fn text(value: &Value, key: &str, max: usize) -> Result<String> {
    let value = value
        .get(key)
        .and_then(Value::as_str)
        .ok_or_else(|| anyhow::anyhow!("Malformed GitHub response"))?;
    ensure!(value.len() <= max, "GitHub value is too long");
    Ok(value.to_owned())
}

fn pull(value: &Value) -> Result<GithubPull> {
    let branch = |name: &str| -> Result<(&Value, String)> {
        let branch = &value[name];
        let sha = text(branch, "sha", 64)?;
        ensure!(
            sha.len() == 40 && sha.bytes().all(|c| c.is_ascii_hexdigit()),
            "Invalid GitHub commit ID"
        );
        Ok((branch, sha))
    };
    let (head, head_sha) = branch("head")?;
    let (base, base_sha) = branch("base")?;
    let repository_id = base["repo"]["id"]
        .as_u64()
        .ok_or_else(|| anyhow::anyhow!("Missing GitHub repository identity"))?;
    let number = value["number"]
        .as_u64()
        .and_then(|n| u32::try_from(n).ok())
        .filter(|n| *n > 0)
        .ok_or_else(|| anyhow::anyhow!("Invalid pull request number"))?;
    let reviewers = value["requested_reviewers"]
        .as_array()
        .ok_or_else(|| anyhow::anyhow!("Missing GitHub reviewers"))?;
    ensure!(reviewers.len() <= 100, "Too many reviewers");
    let state = text(value, "state", 16)?;
    ensure!(
        state == "open" || state == "closed",
        "Invalid pull request state"
    );
    Ok(GithubPull {
        number,
        repository_id: repository_id.to_string(),
        title: text(value, "title", 4096)?,
        author: text(&value["user"], "login", 100)?,
        state,
        draft: value["draft"].as_bool().unwrap_or(false),
        merged: value["merged"].as_bool().unwrap_or(false) || value["merged_at"].is_string(),
        head_sha,
        base_sha,
        head_ref: text(head, "ref", 1024)?,
        requested_reviewers: reviewers
            .iter()
            .map(|v| text(v, "login", 100))
            .collect::<Result<_>>()?,
        updated_at: text(value, "updated_at", 64)?,
    })
}

fn decode(
    status: u16,
    headers: &header::HeaderMap,
    body: &[u8],
    endpoint: &GithubEndpoint,
) -> Result<GithubResponse> {
    let header_text = |name: &str| {
        headers
            .get(name)
            .and_then(|v| v.to_str().ok())
            .map(str::to_owned)
    };
    let numeric = |name: &str| header_text(name).and_then(|v| v.parse().ok());
    let pulls = if status == 200 {
        let value: Value = serde_json::from_slice(body)?;
        match endpoint {
            GithubEndpoint::List { .. } => {
                let list = value
                    .as_array()
                    .ok_or_else(|| anyhow::anyhow!("Expected pull list"))?;
                ensure!(list.len() <= 100, "Pull list is too large");
                list.iter().map(pull).collect::<Result<_>>()?
            }
            GithubEndpoint::Pull { .. } => vec![pull(&value)?],
        }
    } else {
        vec![]
    };
    Ok(GithubResponse {
        status,
        etag: header_text("etag").filter(|v| v.len() <= 256),
        retry_after_seconds: numeric("retry-after"),
        reset_at_seconds: numeric("x-ratelimit-reset"),
        remaining: numeric("x-ratelimit-remaining"),
        has_next: header_text("link").is_some_and(|v| v.contains("rel=\"next\"")),
        pulls,
    })
}

pub async fn read(request: GithubRequest) -> Result<GithubResponse> {
    let path = path(&request)?;
    // one process-wide budget: windows cannot multiply the public unauthenticated quota.
    let mut requests = REQUESTS.lock().await;
    while requests
        .front()
        .is_some_and(|at| at.elapsed() >= Duration::from_secs(3600))
    {
        requests.pop_front();
    }
    ensure!(
        requests.len() < 55,
        "Public GitHub read budget exhausted; retry in an hour"
    );
    requests.push_back(Instant::now());
    let client = Client::builder()
        .timeout(Duration::from_secs(20))
        .redirect(reqwest::redirect::Policy::none())
        .referer(false)
        .build()?;
    let mut query = client
        .get(format!("https://api.github.com{path}"))
        .header(header::USER_AGENT, "GG-public-review-cache")
        .header(header::ACCEPT, "application/vnd.github+json")
        .header("X-GitHub-Api-Version", "2022-11-28");
    if let Some(etag) = &request.etag {
        query = query.header(header::IF_NONE_MATCH, etag);
    }
    let mut response = query.send().await?;
    let status = response.status().as_u16();
    let headers = response.headers().clone();
    if response
        .content_length()
        .is_some_and(|size| size > MAX_BYTES as u64)
    {
        bail!("GitHub response exceeds 5 MiB");
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await? {
        ensure!(
            bytes.len() + chunk.len() <= MAX_BYTES,
            "GitHub response exceeds 5 MiB"
        );
        bytes.extend_from_slice(&chunk);
    }
    decode(status, &headers, &bytes, &request.endpoint)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn endpoint_cannot_escape_fixed_host_or_read_unbounded_pages() {
        let mut request = GithubRequest {
            owner: "owner".into(),
            repo: "repo".into(),
            endpoint: GithubEndpoint::List { page: 1 },
            etag: None,
        };
        assert!(
            path(&request)
                .unwrap()
                .starts_with("/repos/owner/repo/pulls?")
        );
        for invalid in ["..", "a/b", "https://evil", "x?y", "x\n"] {
            request.owner = invalid.into();
            assert!(path(&request).is_err());
        }
        request.owner = "owner".into();
        request.endpoint = GithubEndpoint::List { page: 4 };
        assert!(path(&request).is_err());
        request.endpoint = GithubEndpoint::Pull { number: 1 };
        request.etag = Some("bad\r\nheader".into());
        assert!(path(&request).is_err());
    }
    #[test]
    fn conditional_and_rate_responses_need_no_json_body() {
        let mut headers = header::HeaderMap::new();
        headers.insert("retry-after", "60".parse().unwrap());
        headers.insert("x-ratelimit-remaining", "0".parse().unwrap());
        for status in [304, 403, 429, 404] {
            let response = decode(
                status,
                &headers,
                b"not-json",
                &GithubEndpoint::List { page: 1 },
            )
            .unwrap();
            assert!(response.pulls.is_empty());
            assert_eq!(response.retry_after_seconds, Some(60));
        }
    }
    #[test]
    fn validates_remote_identity_and_normalizes_public_fields() {
        let value = serde_json::json!({"number":2,"title":"A change","user":{"login":"author"},"state":"open","draft":false,"merged_at":null,"head":{"sha":"a".repeat(40),"ref":"feature"},"base":{"sha":"b".repeat(40),"repo":{"id":123}},"requested_reviewers":[{"login":"reviewer"}],"updated_at":"2026-11-10T00:00:00Z"});
        let result = pull(&value).unwrap();
        assert_eq!(result.repository_id, "123");
        assert_eq!(result.requested_reviewers, ["reviewer"]);
        let mut bad = value;
        bad["head"]["sha"] = "short".into();
        assert!(pull(&bad).is_err());
    }
}
