<script lang="ts">
    import { untrack } from "svelte";

    import { setDestinationCandidates } from "./commands/context";
    import { anchoredHistoryScroll, historyDensity, historyRowHeight } from "./graphLayout";
    import { onMount, onDestroy, tick } from "svelte";
    import type { LogPage } from "./messages/LogPage.js";
    import type { RevHeader } from "./messages/RevHeader";
    import type { RevSet } from "./messages/RevSet";
    import { getInput, query, trigger } from "./ipc.js";
    import { sameChange } from "./ids.js";
    import { workspaceController } from "./workspace/state";
    import { activeLogQuery, ignoreToggled, logQueryRequest, pickedRevisions, repoStatusEvent, revisionSelectEvent, selectionHeaders } from "./stores.js";
    import RevisionMutator from "./mutators/RevisionMutator.js";
    import TextField from "./controls/TextField.svelte";
    import TimelineDisplayOptions from "./timeline/TimelineDisplayOptions.svelte";
    import TimelineSection from "./timeline/TimelineSection.svelte";
    import { timelineDisplay } from "./timeline/display";
    import ViewToolbar from "./controls/ViewToolbar.svelte";
    import RevisionObject from "./objects/RevisionObject.svelte";
    import ActionWidget from "./controls/ActionWidget.svelte";
    import Icon from "./controls/Icon.svelte";
    import SelectWidget from "./controls/SelectWidget.svelte";
    import ListWidget, { type List, type Selection } from "./controls/ListWidget.svelte";
    import GraphLog from "./GraphLog.svelte";
    import { GraphPageBuilder, type EnhancedRow } from "./graphRows";


    interface Props {
        integrated?: boolean;
        reservedInset?: number;
        overlayInset?: number;
        query_choices: Record<string, string>;
        latest_query: string;
    }

    let {
        integrated = false,
        reservedInset = 0,
        overlayInset = 0,
        query_choices = $bindable(),
        latest_query
    }: Props = $props();

    function toSentenceCase(kebab: string): string {
        let label = kebab.replaceAll("-", " ");
        return label.charAt(0).toUpperCase() + label.slice(1);
    }


    let entered_query = $state(untrack(() => latest_query));
    let graphRows: EnhancedRow[] | undefined = $state.raw();
    let graphBuilder = new GraphPageBuilder();
    let logError = $state("");
    let latestLogRequest = 0;

    let selectionAnchorIdx: number | undefined; // selection model is topologically ordered, selection view requires an anchor point

    let logHeight = $state(0);
    let logWidth = $state(0);
    let logScrollTop = $state(0);
    let graphBody = $state<HTMLDivElement>();
    let rowMeasurement = $state(untrack(() => $historyRowHeight));
    let measuredRowHeight = $state(untrack(() => $historyRowHeight));
    let previousRowHeight = untrack(() => measuredRowHeight);
    async function preserveHistoryAnchor(height: number) {
        let box = graphBody?.querySelector<HTMLElement>(".listbox");
        let top = anchoredHistoryScroll(logScrollTop, previousRowHeight, height);
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
            clearPicks();
            setSelection(row, row);
            if ($revisionSelectEvent) workspaceController.selectRevision($revisionSelectEvent);
        },
        extendSelection(row: number) {
            if (!graphRows || selectionAnchorIdx === undefined) return;
            clearPicks();

            const limitIdx = findLinearLimit(selectionAnchorIdx, row);
            if (limitIdx === row) {
                setSelection(undefined, row); // keep anchor, extend to new row
                if ($revisionSelectEvent) workspaceController.selectRevision($revisionSelectEvent);
            }
        },
        moveFocus(row: number) {
            focusRow(row);
        },
        toggleRow(row: number) {
            if (graphRows?.[row]) handleToggle(graphRows[row].revision);
        },
        clearToggled() {
            if (!$pickedRevisions.length) return false;
            clearPicks();
            return true;
        },
        editRow(row: number) {
            if (row != -1) {
                new RevisionMutator([graphRows![row].revision], $ignoreToggled).onEdit();
            }
        },
    };

    onMount(() => { loadLog(true); });
    onDestroy(() => latestLogRequest++);


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
            if (line.child.id.commit.hex === childCommitHex && line.parent?.id.commit.hex === parentCommitHex) {
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

    function clearPicks() {
        if ($pickedRevisions.length) pickedRevisions.set([]);
    }

    function focusRow(row: number) {
        setSelection(row, row);
        if ($revisionSelectEvent) workspaceController.selectRevision($revisionSelectEvent);
    }

    function rowOf(header: RevHeader) {
        return graphRows?.findIndex(row => row.revision.id.commit.hex === header.id.commit.hex) ?? -1;
    }

    // a scattered selection starts from whatever was selected, then toggles one revision at a time;
    // the panels follow the revision last clicked, since scattered revisions have no combined diff
    function handleToggle(header: RevHeader) {
        if (!graphRows) return;
        let picks = $pickedRevisions.length ? $pickedRevisions : $selectionHeaders.filter(selected => rowOf(selected) !== -1);
        let picked = picks.some(pick => pick.id.commit.hex === header.id.commit.hex);
        let next = (picked ? picks.filter(pick => pick.id.commit.hex !== header.id.commit.hex) : [...picks, header])
            .sort((a, b) => rowOf(a) - rowOf(b));
        let focus = picked ? next[next.length - 1] : header;
        pickedRevisions.set(next.length > 1 ? next : []);
        if (focus) focusRow(rowOf(focus));
    }


    function handleClick(header: RevHeader) {
        if (!graphRows) return;

        clearPicks();
        const clickedIdx = graphRows.findIndex((r) => r.revision.id.commit.hex === header.id.commit.hex);
        if (clickedIdx !== -1) {
            setSelection(clickedIdx, clickedIdx);
            if ($revisionSelectEvent) workspaceController.selectRevision($revisionSelectEvent);
        }
    }

    function handleShiftClick(header: RevHeader) {
        clearPicks();
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

        query_choices = { ...query_choices, [name]: entered_query };
        writePresets();
    }

    function handleDeletePreset() {
        let keyToDelete = Object.entries(query_choices).find(
            ([key, value]) => key !== "default" && value === entered_query,
        )?.[0];
        if (!keyToDelete) return;

        let next = { ...query_choices };
        delete next[keyToDelete];
        query_choices = next;
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
            graphBuilder.reset();
            graphRows = graphBuilder.append(page.value.rows);

            if (selectFirst && !$revisionSelectEvent && page.value.rows.length > 0) {
                setSelection(0, 0);
            }

            while (page.value.has_more) {
                let next_page = await query<LogPage>("query_log_next_page", null);
                if (request !== latestLogRequest) return;
                if (next_page.type == "data") {
                    graphRows = graphBuilder.append(next_page.value.rows);
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

    let presets = $derived((() => {
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
    })());
    let choices: ReturnType<typeof getChoices> = $derived(getChoices(entered_query, presets));
    let graphSummary = $derived(logError ? "Unavailable" : graphRows ? `${graphRows.length} ${graphRows.length === 1 ? "revision" : "revisions"}` : "Loading…");
    $effect.pre(() => {
        if (rowMeasurement > 0) measuredRowHeight = rowMeasurement;
    });
    let textScale = $derived(measuredRowHeight / $historyRowHeight);
    let authorSpace = $derived($historyDensity === "tall" ? 20 * textScale : 0);
    $effect.pre(() => {
        let height = measuredRowHeight;
        untrack(() => { if (height !== previousRowHeight) preserveHistoryAnchor(height); });
    });

    $effect.pre(() => {
        let query = entered_query;
        untrack(() => activeLogQuery.set(query));
    });
    $effect.pre(() => {
        if ($repoStatusEvent) untrack(reloadLog);
    });
    $effect.pre(() => {
        let requested = $logQueryRequest;
        if (requested) untrack(() => applyQueryRequest(requested));
    });
    $effect.pre(() => {
        let rows = graphRows, picks = $pickedRevisions;
        if (rows && picks.length) untrack(() => {
            let remaining = picks.filter(pick => rowOf(pick) !== -1);
            if (remaining.length !== picks.length) pickedRevisions.set(remaining.length > 1 ? remaining : []);
        });
    });
    let picked = $derived(new Set($pickedRevisions.map(pick => pick.id.commit.hex)));
    let isCustom = $derived(!presets.some((p) => !p.separator && p.value === entered_query));
    let isDeletable =
        $derived(!isCustom && presets.some((p) => !p.separator && p.value === entered_query && p.label !== "Default"));
    $effect.pre(() => {
        let candidates = graphRows?.map(row => row.revision) ?? [];
        untrack(() => setDestinationCandidates(candidates));
    });
</script>

{#if integrated}
    <ViewToolbar label="Timeline tools">
        {#if $pickedRevisions.length}
            <span class="graph-caption picks toolbar-lead" role="status"><span class="pick-count">{$pickedRevisions.length}</span>selected</span>
            <button type="button" class="clear-picks toolbar-lead" title="Clear selection (Escape)" onclick={clearPicks}>Clear</button>
        {:else}<span class="graph-caption toolbar-lead">{graphSummary}</span>{/if}
        <span class="toolbar-spacer"><TimelineDisplayOptions /></span>
    </ViewToolbar>
{/if}

<TimelineSection bind:element={graphBody} showHeader={!integrated} showSummary={!integrated}>
    {#snippet header()}<div  class="standalone-title"><h2 tabindex="-1">Timeline</h2><TimelineDisplayOptions /></div>{/snippet}
    {#snippet footer()}<div  class="log-selector" class:editable={isCustom || isDeletable}>
        <SelectWidget options={choices} bind:value={entered_query} onChange={reloadLog}>
            {#snippet children({ option })}{option.label}{/snippet}
        </SelectWidget>
        <TextField
            dir="ltr" label="Filter revisions with a revset"
            title="Jujutsu revset"
            type="text"
            autocapitalize="off"
            autocorrect="off"
            autocomplete="off"
            spellcheck="false"
            bind:value={entered_query}
            onchange={reloadLog} />
        {#if isCustom}
            <ActionWidget secondary tip="Save revset" onClick={handleSavePreset}>
                <Icon name="save" />
            </ActionWidget>
        {:else if isDeletable}
            <ActionWidget secondary tip="Delete revset" onClick={handleDeletePreset}>
                <Icon name="x-square" />
            </ActionWidget>
        {/if}
    </div>{/snippet}
    {#snippet summary()}<div  class="graph-caption"><span>{graphSummary}</span></div>{/snippet}
    <div class="history-measure" style:--history-base-row={$historyRowHeight} bind:clientHeight={rowMeasurement} aria-hidden="true"></div>
    <ListWidget
        type="Revision"
        rowHeight={measuredRowHeight}
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
                rowHeight={measuredRowHeight}
                {authorSpace}
                containerHeight={logHeight}
                endInset={reservedInset}
                containerWidth={logWidth}
                scrollTop={logScrollTop}
                rows={graphRows}
                >
                {#snippet children({ row })}
                                                {#if row}
                        <RevisionObject
                            rowHeight={measuredRowHeight}
                            {textScale}
                            tall={$historyDensity === "tall"}
                            header={row.revision}
                            selected={picked.size ? picked.has(row.revision.id.commit.hex) : isInSelectedRange(row, $revisionSelectEvent)}
                            onClick={handleClick}
                            onShiftClick={handleShiftClick}
                            onToggle={handleToggle}
                            showChange={$timelineDisplay.change}
                            showCommit={$timelineDisplay.commit}
                            showBookmarks={$timelineDisplay.bookmarks}
                            showTags={$timelineDisplay.tags} />
                    {/if}
                                                            {/snippet}
                                        </GraphLog>
            {:else}<div class="empty-graph"><Icon name="git-branch" /><h3>No revisions match</h3><p>Try another view or change the revset.</p></div>{/if}
        {:else}
            <div class="empty-graph" role="status"><h3>Loading revisions…</h3><p>Reading your repository graph.</p></div>
        {/if}
    </ListWidget>
</TimelineSection>

<style>
    :global(.graph-body .listbox) { overflow-anchor: none; }
    .history-measure { position: absolute; visibility: hidden; pointer-events: none; width: 1px; font-size: var(--type-ui); height: max(calc(var(--history-base-row) * 1px), calc(var(--history-base-row) * 1em / 13)); }
    @media (max-width: 600px) { .history-measure { height: max(calc(var(--history-base-row) * 1px), calc(var(--history-base-row) * 1em / 14)); } }
    h2 { font-size: 13px; font-weight: 500; margin: 0; }
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

    .log-selector :global(.text-field) {
        font-family: var(--stack-code);
        font-size: var(--type-ui);
        color: var(--muted);
    }
    .log-selector :global(.text-field:focus-visible) { color: var(--text-strong); }
    .standalone-title { display: flex; align-items: center; justify-content: space-between; width: 100%; gap: 8px; }
    .graph-caption { display: flex; justify-content: space-between; align-items: center; gap: 16px; font-size: 12px; color: var(--muted); }
    .graph-caption > span:first-child { color: var(--muted); }
    .picks { gap: 6px; color: var(--text); }
    .pick-count { display: inline-grid; place-items: center; min-width: 18px; height: 18px; padding: 0 5px; border-radius: 9px; background: var(--text); color: var(--surface); font: 600 11px/1 var(--stack-ui); font-variant-numeric: tabular-nums; }
    .clear-picks { min-height: 24px; padding: 2px 8px; border: 0; border-radius: var(--radius-sm); background: transparent; color: var(--muted); font: inherit; font-size: var(--type-caption); cursor: pointer; }
    @media (hover: hover) { .clear-picks:hover { background: var(--hover); color: var(--text); } }
    .empty-graph { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; padding: 40px 16px; color: var(--muted); text-align: center; }
    .empty-graph h3 { color: var(--text); font-size: 14px; }
    .empty-graph p { font-size: 13px; }

    @media (pointer: coarse), (max-width: 600px) {
        .log-selector, .log-selector.editable { grid-template-columns: 136px minmax(0, 1fr); min-height: 44px; }
        .log-selector.editable { grid-template-columns: 136px minmax(0, 1fr) auto; }
        .log-selector :global(.text-field), .log-selector :global(select) { font-size: max(16px, 1rem); min-height: 44px; }
    }
</style>
