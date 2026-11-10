<script lang="ts">
    import { onMount, untrack } from "svelte";
    import { Compartment, EditorState, type Extension } from "@codemirror/state";
    import { EditorView, drawSelection, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers } from "@codemirror/view";
    import { defaultKeymap, history, historyKeymap, indentWithTab, selectAll } from "@codemirror/commands";
    import { LanguageDescription, bracketMatching, indentUnit, type LanguageSupport } from "@codemirror/language";
    import { highlightSelectionMatches, search, searchKeymap } from "@codemirror/search";
    import { languages } from "@codemirror/language-data";
    import { changeGutter, setMarks, type GutterMark } from "./changeGutter";
    import type { TextTarget } from "../commands/textCommands";
    import { editorTheme, syntaxTheme } from "./editorTheme";
    import { noteGutter, setNotes, type LineNotes } from "./noteGutter";
    import type { EditorMenu } from "./editorMenu";

    interface Props {
        text: string;
        path: string;
        readOnly: boolean;
        wrap: boolean;
        changes?: GutterMark[];
        notes?: LineNotes[];
        /** right-click or the menu key; the cursor has already moved if the click was outside the selection */
        onMenu?: (menu: EditorMenu) => void;
        onChange: (text: string) => void;
        onSave: () => void;
        label?: string;
    }

    let { text, path, readOnly, wrap, changes = [], notes = [], onMenu, onChange, onSave, label = "File contents" }: Props = $props();

    let host = $state<HTMLElement>();
    let view: EditorView | undefined;
    let access = new Compartment();
    let wrapping = new Compartment();
    let language = new Compartment();
    // the last text and path this component showed or emitted, so echoes of typing are not reloads
    let shown = { text: "", path: "" };
    let languageRequest = 0;
    let support: Extension = [];

    function extensions(marks: GutterMark[], lineNotes: LineNotes[]): Extension[] {
        return [
            changeGutter(marks),
            noteGutter(lineNotes),
            lineNumbers(),
            highlightActiveLineGutter(),
            highlightActiveLine(),
            drawSelection(),
            history(),
            bracketMatching(),
            highlightSelectionMatches(),
            search({ top: true }),
            indentUnit.of("    "),
            editorTheme,
            syntaxTheme,
            access.of([EditorState.readOnly.of(readOnly)]),
            wrapping.of(wrap ? EditorView.lineWrapping : []),
            language.of(support),
            EditorView.domEventHandlers({ contextmenu: openMenu }),
            EditorView.contentAttributes.of({ "aria-label": label, "aria-multiline": "true" }),
            keymap.of([
                { key: "Mod-s", preventDefault: true, run: () => { onSave(); return true; } },
                ...searchKeymap,
                ...historyKeymap,
                ...defaultKeymap,
                indentWithTab,
            ]),
            EditorView.updateListener.of(update => {
                if (!update.docChanged) return;
                let next = update.state.doc.toString();
                shown.text = next;
                onChange(next);
            }),
        ];
    }

    function textTarget(view: EditorView): TextTarget {
        return {
            selected: () => { let { from, to } = view.state.selection.main; return view.state.sliceDoc(from, to); },
            editable: !readOnly,
            replaceSelection: next => view.dispatch(view.state.update(view.state.replaceSelection(next), { userEvent: next ? "input.paste" : "delete.cut", scrollIntoView: true })),
            selectAll: () => { selectAll(view); },
            focus: () => view.focus(),
        };
    }

    // native editors move the cursor to the click unless it lands inside the selection; the menu key opens at the cursor
    function openMenu(event: MouseEvent, view: EditorView): boolean {
        if (!onMenu) return false;
        let keyboard = event.button !== 2 && !event.ctrlKey;
        let at: { x: number; y: number };
        if (keyboard) {
            let caret = view.coordsAtPos(view.state.selection.main.head);
            let bounds = view.dom.getBoundingClientRect();
            at = caret ? { x: caret.left, y: caret.bottom } : { x: bounds.left, y: bounds.top };
        } else {
            at = { x: event.clientX, y: event.clientY };
            let position = view.posAtCoords(at, false);
            let { from, to } = view.state.selection.main;
            if (position < from || position > to) view.dispatch({ selection: { anchor: position }, userEvent: "select.pointer" });
        }
        event.preventDefault();
        view.focus();
        let { from, to } = view.state.selection.main;
        onMenu({ ...at, doc: view.state.doc, from, to, target: textTarget(view) });
        return true;
    }

    async function loadLanguage(file: string) {
        let request = ++languageRequest;
        let description = LanguageDescription.matchFilename(languages, file.split("/").pop() ?? file);
        let loaded: LanguageSupport | null = null;
        if (description) {
            try { loaded = await description.load(); } catch { loaded = null; }
        }
        if (request !== languageRequest || !view) return;
        support = loaded ?? [];
        view.dispatch({ effects: language.reconfigure(support) });
    }

    // a different file or version is a new state, so undo history never crosses documents
    function replace(next: string, file: string) {
        if (!view) return;
        let samePath = shown.path === file;
        let scroll = view.scrollDOM.scrollTop;
        let head = view.state.selection.main.head;
        shown = { text: next, path: file };
        if (!samePath) support = [];
        view.setState(EditorState.create({ doc: next, extensions: extensions(untrack(() => changes), untrack(() => notes)) }));
        if (samePath) {
            view.dispatch({ selection: { anchor: Math.min(head, next.length) } });
            view.scrollDOM.scrollTop = scroll;
            requestAnimationFrame(() => { if (view) view.scrollDOM.scrollTop = scroll; });
        }
        if (!samePath) void loadLanguage(file);
    }

    onMount(() => {
        shown = { text, path };
        view = new EditorView({ parent: host, state: EditorState.create({ doc: text, extensions: extensions(changes, notes) }) });
        void loadLanguage(path);
        return () => { languageRequest++; view?.destroy(); view = undefined; };
    });

    $effect(() => {
        let next = text, file = path;
        untrack(() => {
            if (!view) return;
            if (file === shown.path && next === shown.text) return;
            replace(next, file);
        });
    });
    $effect(() => {
        let flag = readOnly;
        untrack(() => view?.dispatch({ effects: access.reconfigure([EditorState.readOnly.of(flag)]) }));
    });
    $effect(() => {
        let flag = wrap;
        untrack(() => view?.dispatch({ effects: wrapping.reconfigure(flag ? EditorView.lineWrapping : []) }));
    });
    $effect(() => {
        let entries = notes;
        untrack(() => view?.dispatch({ effects: setNotes.of(entries) }));
    });
    $effect(() => {
        let marks = changes;
        untrack(() => view?.dispatch({ effects: setMarks.of(marks) }));
    });
</script>

<div class="code-editor" bind:this={host}></div>

<style>
    .code-editor { flex: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column; overflow: hidden; background: var(--surface); pointer-events: auto; }
    .code-editor > :global(.cm-editor) { flex: 1; min-height: 0; }
</style>
