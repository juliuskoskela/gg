<script lang="ts">
    import { setDestinationCandidates } from "./commands/context";
    import { anchoredHistoryScroll, historyDensity, historyRowHeight } from "./graphLayout";
    import { onMount, tick } from "svelte";
    import type { LogPage } from "./messages/LogPage.js";
    import type { LogRow } from "./messages/LogRow.js";
    import type { RevHeader } from "./messages/RevHeader";
    import type { RevSet } from "./messages/RevSet";
    import { getInput, query, trigger } from "./ipc.js";
    import { sameChange } from "./ids.js";
    import { workspaceController } from "./workspace/state";
    import { activeLogQuery, selectWorkingCopy, ignoreToggled, logQueryRequest, repoStatusEvent, revisionSelectEvent } from "./stores.js";
    import RevisionMutator from "./mutators/RevisionMutator.js";
    import Pane from "./shell/Pane.svelte";
    import RevisionObject from "./objects/RevisionObject.svelte";
    import ActionWidget from "./controls/ActionWidget.svelte";
    import Icon from "./controls/Icon.svelte";
    import SelectWidget from "./controls/SelectWidget.svelte";
    import ListWidget, { type List, type Selection } from "./controls/ListWidget.svelte";
    import { type EnhancedRow, default as GraphLog, type EnhancedLine } from "./GraphLog.svelte";


    export let integrated = false;
    export let reservedInset = 0;
    export let overlayInset = 0;
    export let query_choices: Record<string, string>;
    export let latest_query: string;

    function toSentenceCase(kebab: string): string {
        let label = kebab.replaceAll("-", " ");
        return label.charAt(0).toUpperCase() + label.slice(1);
    }

    $: presets = (() => {
        let result: { label: string; value: string; separator?: boolean }[] = [];

        // revsets.log first
        if (query_choices["default"] !== undefined) {
            result.push({ label: "Default", value: query_choices["default"] });
        }

        // followed by [gg.presets]
        let others = Object.entries(query_choices)
            .filter(([key]) => key !== "default")
            .map(([key, value]) => ({ label: toSentenceCase(key), value }))
            .sort((a, b) => a.label.localeCompare(b.label));

        if (others.length > 0) {
            result.push({ label: "", value: "", separator: true });
            result.push(...others);
        }

        return result;
    })();

    let choices: ReturnType<typeof getChoices>;
    let entered_query = latest_query;
    let graphRows: EnhancedRow[] | undefined;
    let logError = "";
    let latestLogRequest = 0;

    let selectionAnchorIdx: number | undefined; // selection model is topologically ordered, selection view requires an anchor point

    let logHeight = 0;
    let logWidth = 0;
    let logScrollTop = 0;
    let graphBody: HTMLDivElement;
    let previousRowHeight = $historyRowHeight;
    $: if ($historyRowHeight !== previousRowHeight) preserveHistoryAnchor($historyRowHeight);
    async function preserveHistoryAnchor(height: number) {
        let box = graphBody?.querySelector<HTMLElement>(".listbox");
        let top = anchoredHistoryScroll(box?.scrollTop ?? logScrollTop, previousRowHeight, height);
        previousRowHeight = height;
        await tick();
        if (box) box.scrollTop = top;
        logScrollTop = box?.scrollTop ?? top;
    }

    /**
     * Helper to set selection with proper topological ordering.
     * In the graph, higher indices are older (ancestors), so from should have the higher index.
     * @param anchorIdx - The anchor point (first clicked). Pass undefined to keep existing anchor.
     * @param extendIdx - The extension point (shift-clicked or arrow-extended to).
     */
    function setSelection(anchorIdx: number | undefined, extendIdx: number) {
        if (!graphRows) return;

        if (anchorIdx !== undefined) {
            selectionAnchorIdx = anchorIdx;
        }

        const effectiveAnchor = selectionAnchorIdx ?? extendIdx;
        const fromIdx = Math.max(effectiveAnchor, extendIdx);
        const toIdx = Math.min(effectiveAnchor, extendIdx);

        $revisionSelectEvent = {
            from: graphRows[fromIdx].revision.id,
            to: graphRows[toIdx].revision.id,
        };
    }

    // all these calculations are not efficient. probably doesn't matter
    let list: List = {
        getSize() {
            return graphRows?.length ?? 0;
        },
        getSelection(): Selection {
            if (!graphRows || selectionAnchorIdx === undefined || !$revisionSelectEvent) {
                return { from: -1, to: -1 };
            }

            // translate from toplogical from::to to listwidget's anchor::extension
            const revSetFromIdx = graphRows.findIndex(
                (row) => row.revision.id.commit.hex === $revisionSelectEvent!.from.commit.hex,
            );
            const revSetToIdx = graphRows.findIndex(
                (row) => row.revision.id.commit.hex === $revisionSelectEvent!.to.commit.hex,
            );

            const extensionIdx = revSetFromIdx === selectionAnchorIdx ? revSetToIdx : revSetFromIdx;

            return { from: selectionAnchorIdx, to: extensionIdx };
        },
        selectRow(row: number) {
            setSelection(row, row);
            if ($revisionSelectEvent) workspaceController.selectRevision($revisionSelectEvent);
        },
        extendSelection(row: number) {
            if (!graphRows || selectionAnchorIdx === undefined) return;

            const limitIdx = findLinearLimit(selectionAnchorIdx, row);
            if (limitIdx === row) {
                setSelection(undefined, row); // keep anchor, extend to new row
                if ($revisionSelectEvent) workspaceController.selectRevision($revisionSelectEvent);
            }
        },
        editRow(row: number) {
            if (row != -1) {
                new RevisionMutator([graphRows![row].revision], $ignoreToggled).onEdit();
            }
        },
    };

    onMount(() => {
        loadLog(true);
    });

    $: choices = getChoices(entered_query, presets);
    $: activeLogQuery.set(entered_query);
    $: if ($repoStatusEvent) reloadLog();
    $: if ($logQueryRequest) applyQueryRequest($logQueryRequest);

    function applyQueryRequest(revset: string) {
        logQueryRequest.set(null);
        entered_query = revset;
        reloadLog();
    }

    function isInSelectedRange(row: EnhancedRow, selection: typeof $revisionSelectEvent): boolean {
        if (!selection || !graphRows) return false;
        const fromIdx = graphRows.findIndex((r) => r.revision.id.commit.hex === selection.from.commit.hex);
        const toIdx = graphRows.findIndex((r) => r.revision.id.commit.hex === selection.to.commit.hex);
        const rowIdx = graphRows.indexOf(row);
        if (fromIdx === -1 || toIdx === -1 || rowIdx === -1) return false;
        const minIdx = Math.min(fromIdx, toIdx);
        const maxIdx = Math.max(fromIdx, toIdx);
        return rowIdx >= minIdx && rowIdx <= maxIdx;
    }

    /**
     * Check if childRow's revision is a direct (non-elided) parent of parentRow's revision.
     * In the graph, lower indices are children (newer), higher indices are parents (older).
     */
    function isDirectParent(childRow: EnhancedRow, parentRow: EnhancedRow): boolean {
        const childCommitHex = childRow.revision.id.commit.hex;
        const parentCommitHex = parentRow.revision.id.commit.hex;

        const isParent = childRow.revision.parent_ids.some((p) => p.hex === parentCommitHex);
        if (!isParent) {
            return false;
        }

        // find a connecting line
        for (const line of childRow.passingLines) {
            if (line.child.id.commit.hex === childCommitHex && line.parent.id.commit.hex === parentCommitHex) {
                return !line.indirect && line.type !== "ToMissing";
            }
        }

        // elided sequences not supported for now - this is possible, but perhaps not useful
        return false;
    }

    /**
     * Find the farthest index from anchorIdx toward targetIdx that maintains linearity.
     */
    function findLinearLimit(anchorIdx: number, targetIdx: number): number {
        if (!graphRows) return anchorIdx;

        const direction = targetIdx > anchorIdx ? 1 : -1;
        let lastValidIdx = anchorIdx;

        for (let i = anchorIdx + direction; direction > 0 ? i <= targetIdx : i >= targetIdx; i += direction) {
            const checkStart = direction > 0 ? lastValidIdx : i;
            const checkEnd = direction > 0 ? i : lastValidIdx;
            if (isDirectParent(graphRows[checkStart], graphRows[checkEnd])) {
                lastValidIdx = i;
            } else {
                break;
            }
        }

        return lastValidIdx;
    }

    function handleClick(header: RevHeader) {
        if (!graphRows) return;

        const clickedIdx = graphRows.findIndex((r) => r.revision.id.commit.hex === header.id.commit.hex);
        if (clickedIdx !== -1) {
            setSelection(clickedIdx, clickedIdx);
            if ($revisionSelectEvent) workspaceController.selectRevision($revisionSelectEvent);
        }
    }

    function handleShiftClick(header: RevHeader) {
        if (!graphRows || selectionAnchorIdx === undefined) {
            handleClick(header); // initial selection
            return;
        }

        const clickedIdx = graphRows.findIndex((r) => r.revision.id.commit.hex === header.id.commit.hex);
        if (clickedIdx === -1) {
            handleClick(header); // invalid selection
            return;
        }

        const limitIdx = findLinearLimit(selectionAnchorIdx, clickedIdx);
        setSelection(undefined, limitIdx); // keep anchor, extend to limit
        if ($revisionSelectEvent) workspaceController.selectRevision($revisionSelectEvent);
    }

    function getChoices(query: string, presetList: typeof presets) {
        for (let choice of presetList) {
            if (query == choice.value) {
                return presetList;
            }
        }

        return [{ label: "Custom", value: query }, ...presetList];
    }

    $: isCustom = !presets.some((p) => !p.separator && p.value === entered_query);

    $: isDeletable =
        !isCustom && presets.some((p) => !p.separator && p.value === entered_query && p.label !== "Default");

    function writePresets() {
        let values: Record<string, string> = {};
        for (let [key, value] of Object.entries(query_choices)) {
            if (key !== "default") {
                values[key] = value;
            }
        }
        trigger("write_config_table", { scope: "repo", key: ["gg", "presets"], values });
    }

    function toKebabCase(text: string): string {
        return text
            .trim()
            .toLowerCase()
            .replace(/\s+/g, "-")
            .replace(/[^a-z0-9-]/g, "");
    }

    async function handleSavePreset() {
        let response = await getInput("Save revset", "code:" + entered_query, ["Preset name"]);
        if (!response) return;

        let name = toKebabCase(response["Preset name"]);
        if (!name || name === "default") return;

        query_choices[name] = entered_query;
        query_choices = query_choices;
        writePresets();
    }

    function handleDeletePreset() {
        let keyToDelete = Object.entries(query_choices).find(
            ([key, value]) => key !== "default" && value === entered_query,
        )?.[0];
        if (!keyToDelete) return;

        delete query_choices[keyToDelete];
        query_choices = query_choices;
        entered_query = query_choices["default"] ?? "";
        writePresets();
        reloadLog();
    }

    async function loadLog(selectFirst: boolean) {
        logError = "";
        let request = ++latestLogRequest;
        let page = await query<LogPage>(
            "query_log",
            {
                revset: entered_query == "" ? "all()" : entered_query,
            },
            () => { if (request === latestLogRequest) graphRows = undefined; },
        );

        if (request !== latestLogRequest) return;
        if (page.type == "data") {
            passNextRow = [];
            graphRows = [];
            graphRows = addPageToGraph(graphRows, page.value.rows);

            if (selectFirst && !$revisionSelectEvent && page.value.rows.length > 0) {
                setSelection(0, 0);
            }

            while (page.value.has_more) {
                let next_page = await query<LogPage>("query_log_next_page", null);
                if (request !== latestLogRequest) return;
                if (next_page.type == "data") {
                    graphRows = addPageToGraph(graphRows, next_page.value.rows);
                    page = next_page;
                } else {
                    break;
                }
            }

            // XXX perhaps we should retry this after each page
            if (!selectFirst) {
                syncSelectionWithGraph();
            }
        } else if (page.type === "error") {
            logError = page.message;
        }
    }

    $: setDestinationCandidates(graphRows?.map(row => row.revision) ?? []);

    // repository-wide rewrite resolution belongs to Shell, never the filtered graph.
    function syncSelectionWithGraph() {
        const selection = $revisionSelectEvent;
        if (!selection || !graphRows || graphRows.length === 0) {
            return;
        }

        let fromIdx = graphRows.findIndex((r) => r.revision.id.commit.hex === selection.from.commit.hex);
        let toIdx = graphRows.findIndex((r) => r.revision.id.commit.hex === selection.to.commit.hex);

        // reposition anchor, update ids if changed
        if (fromIdx !== -1 && toIdx !== -1) {
            selectionAnchorIdx = toIdx;

            const newFrom = graphRows[fromIdx].revision.id;
            const newTo = graphRows[toIdx].revision.id;
            if (newFrom.commit.hex !== selection.from.commit.hex || newTo.commit.hex !== selection.to.commit.hex) {
                $revisionSelectEvent = { from: newFrom, to: newTo };
            }
        } else if (!$workspaceController.inspector) {
            setSelection(0, 0);
        }
    }

    function reloadLog() {
        loadLog(false);
    }

    // augment rows with all lines that pass through them
    let lineKey = 0;
    let passNextRow: EnhancedLine[] = [];
    function addPageToGraph(graph: EnhancedRow[], page: LogRow[]): EnhancedRow[] {
        for (let row of page) {
            let enhancedRow = row as EnhancedRow;
            for (let passingRow of passNextRow) {
                passingRow.parent = row.revision;
            }
            enhancedRow.passingLines = passNextRow;
            passNextRow = [];

            for (let line of enhancedRow.lines) {
                let enhancedLine = line as EnhancedLine;
                enhancedLine.key = lineKey++;

                if (line.type == "ToIntersection" || line.type == "ToMissing") {
                    // ToIntersection lines begin at their owning row, so they run from this row to the next one that we read (which may not be on the same page)
                    enhancedLine.child = row.revision;
                    enhancedRow.passingLines.push(enhancedLine);
                    passNextRow.push(enhancedLine);
                } else {
                    // other lines end at their owning row, so we need to add them to all previous rows and then this one
                    enhancedLine.parent = row.revision;
                    enhancedLine.child = graph[line.source[1]].revision;
                    for (let i = line.source[1]; i < line.target[1]; i++) {
                        graph[i].passingLines.push(enhancedLine);
                    }
                    enhancedRow.passingLines.push(enhancedLine);
                }
            }

            graph.push(enhancedRow);
        }

        return graph;
    }
</script>

<Pane flexibleHeader>
    <div slot="header" class="graph-header">
        {#if !integrated}<div class="graph-title"><h2 tabindex="-1">History</h2><div class="graph-tools"><ActionWidget secondary tip="Jump to working copy" onClick={selectWorkingCopy}><Icon name="edit-3" /></ActionWidget></div></div>{/if}
    <div class="log-selector" class:editable={isCustom || isDeletable}>
        <SelectWidget options={choices} bind:value={entered_query} on:change={reloadLog}>
            <svelte:fragment let:option>{option.label}</svelte:fragment>
        </SelectWidget>
        <input
            dir="ltr" aria-label="Filter revisions with a revset"
            title="Jujutsu revset"
            type="text"
            autocapitalize="off"
            autocorrect="off"
            autocomplete="off"
            spellcheck="false"
            bind:value={entered_query}
            on:change={reloadLog} />
        {#if isCustom}
            <ActionWidget secondary tip="Save revset" onClick={handleSavePreset}>
                <Icon name="save" />
            </ActionWidget>
        {:else if isDeletable}
            <ActionWidget secondary tip="Delete revset" onClick={handleDeletePreset}>
                <Icon name="x-square" />
            </ActionWidget>
        {/if}
    </div>

    </div>
    <div slot="body" class="graph-body" bind:this={graphBody}>
        <div class="graph-caption"><span>{logError ? "Unavailable" : graphRows ? `${graphRows.length} ${graphRows.length === 1 ? "revision" : "revisions"}` : "Loading…"}</span><label class="density-control"><span>Density</span><select aria-label="History density" value={$historyDensity} on:change={event => historyDensity.set(event.currentTarget.value === "tall" ? "tall" : "compact")}><option value="compact">Compact</option><option value="tall">Tall</option></select></label></div>
    <ListWidget
        type="Revision"
        rowHeight={$historyRowHeight}
        scrollPaddingBottom={overlayInset}
        descendant={$revisionSelectEvent?.to.commit.prefix}
        {list}
        bind:clientHeight={logHeight}
        bind:clientWidth={logWidth}
        bind:scrollTop={logScrollTop}>
        {#if logError}
            <div class="empty-graph" role="alert"><h3>Couldn’t load revisions</h3><p>{logError}</p><ActionWidget onClick={() => loadLog(false)}>Try again</ActionWidget></div>
        {:else if graphRows}
            {#if graphRows.length}
            <GraphLog
                rowHeight={$historyRowHeight}
                containerHeight={logHeight}
                endInset={reservedInset}
                containerWidth={logWidth}
                scrollTop={logScrollTop}
                rows={graphRows}
                let:row>
                {#if row}
                    <RevisionObject
                        rowHeight={$historyRowHeight}
                        tall={$historyDensity === "tall"}
                        header={row.revision}
                        selected={isInSelectedRange(row, $revisionSelectEvent)}
                        onClick={handleClick}
                        onShiftClick={handleShiftClick} />
                {/if}
            </GraphLog>
            {:else}<div class="empty-graph"><Icon name="git-branch" /><h3>No revisions match</h3><p>Try another view or change the revset.</p></div>{/if}
        {:else}
            <div class="empty-graph" role="status"><h3>Loading revisions…</h3><p>Reading your repository graph.</p></div>
        {/if}
    </ListWidget>
    </div>
</Pane>

<style>
    .graph-header { display: grid; gap: 4px; min-width: 0; padding-block-end: 4px; }
    .graph-title { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .graph-title h2 { font-size: 13px; font-weight: 500; margin: 0; }
    .graph-tools { display: flex; align-items: center; gap: 4px; }
    .log-selector {
        min-height: 32px;
        display: grid;
        grid-template-columns: 116px minmax(0, 1fr);
        gap: 8px;

        &.editable {
            grid-template-columns: 116px minmax(0, 1fr) auto;
            & > :global(*:last-child) {
                height: unset;
                align-self: stretch;
                padding: 5px 7px;
            }
        }
    }

    input {
        font-family: var(--stack-code);
        font-size: var(--type-ui);
        color: var(--muted);
    }
    .graph-body { display: grid; grid-template-rows: 28px minmax(0, 1fr); min-width: 0; min-height: 0; }
    input:focus-visible { color: var(--text-strong); }
    .graph-caption { display: flex; justify-content: space-between; align-items: center; gap: 16px; font-size: 12px; color: var(--muted); }
    .density-control { display: flex; align-items: center; gap: 6px; font-size: 12px; }
    .density-control select { min-height: 24px; padding: 0 4px; font-size: 12px; border: 0; background: transparent; }
    @media (pointer: coarse) { .graph-body { grid-template-rows: 44px minmax(0, 1fr); } .density-control select { min-height: 44px; font-size: 16px; } }
    .graph-caption > span:first-child { color: var(--muted); }
    .empty-graph { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; padding: 40px 16px; color: var(--muted); text-align: center; }
    .empty-graph h3 { color: var(--text); font-size: 14px; }
    .empty-graph p { font-size: 13px; }

    @media (pointer: coarse), (max-width: 600px) {
        .log-selector, .log-selector.editable { grid-template-columns: 136px minmax(0, 1fr); min-height: 44px; }
        .log-selector.editable { grid-template-columns: 136px minmax(0, 1fr) auto; }
        .log-selector input, .log-selector :global(select) { font-size: max(16px, 1rem); min-height: 44px; }
    }
</style>
