# Visual regression checks

The Playwright suite in `e2e/visual` compares the Timeline (sparse and dense), Description, Files, Diff (unified, split and wrapped), Evolution, History, Annotations, Settings, context menu and Views menu. Each runs in light and dark at 1440px and 390px.

## Run

Inside the development shell:

```sh
GG_TEST_BROWSER=/path/to/chromium npm run test:visual
```

`pretest:visual` builds the frontend. The existing browser harness starts the Rust backend and extracts `res/test-repo.zip` into a temporary repository. It uses a stable directory name, fixed browser time, explicit theme preferences, bundled fonts and reduced motion. Annotation content is a fixed read-only fixture; other views use the real repository backend. The suite never opens the developer's repository.

Keep the same Chromium build, OS and font environment when reviewing baselines. `GG_TEST_BROWSER` chooses a system browser; omit it to use Playwright's installed Chromium. Cross-platform font rasterization can differ.

## Review and accept

Failures write the expected, actual and difference images under `e2e/results/visual`. Open those images before deciding whether the change is intended. Zero changed pixels are allowed after Playwright's normal per-pixel color threshold; screenshots wait for consecutive stable renders and hide the caret.

For an intentional change:

```sh
GG_TEST_BROWSER=/path/to/chromium npm run test:visual -- --update-snapshots
```

Review the PNG changes in `e2e/visual/snapshots`, then run without `--update-snapshots` to prove the new baselines reproduce. Commit the accepted PNGs with the UI change. Do not regenerate baselines just to clear a failure.
