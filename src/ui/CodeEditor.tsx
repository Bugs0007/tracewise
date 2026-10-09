// CodeMirror 6 wrapper. Autocomplete and auto-closing brackets are deliberately
// OFF: the point of the app is rebuilding typing muscle memory.
import { useEffect, useRef } from 'react';
import { EditorState, StateEffect, StateField, Compartment, type Extension } from '@codemirror/state';
import { Decoration, EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection, type DecorationSet } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { bracketMatching, indentOnInput, syntaxHighlighting, HighlightStyle, indentUnit } from '@codemirror/language';
import { python } from '@codemirror/lang-python';
import { javascript } from '@codemirror/lang-javascript';
import { tags as t } from '@lezer/highlight';
import type { Lang } from '@/content/types';

const highlight = HighlightStyle.define([
  { tag: [t.keyword, t.controlKeyword, t.operatorKeyword, t.definitionKeyword, t.moduleKeyword], color: 'var(--code-kw)' },
  { tag: [t.string, t.special(t.string)], color: 'var(--code-str)' },
  { tag: [t.number, t.bool, t.null], color: 'var(--code-num)' },
  { tag: [t.comment, t.lineComment, t.blockComment], color: 'var(--code-com)', fontStyle: 'italic' },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: 'var(--code-fn)' },
  { tag: [t.className, t.typeName], color: 'var(--code-fn)' },
  { tag: [t.tagName], color: 'var(--code-kw)' },
  { tag: [t.attributeName, t.propertyName], color: 'var(--text)' },
]);

const theme = EditorView.theme({
  '&': { background: 'var(--code-bg)', color: 'var(--text)', borderRadius: '4px', border: '1px solid var(--line)', fontSize: 'var(--editor-fs, 14px)' },
  '&.cm-focused': { outline: '2px solid var(--cobalt)', outlineOffset: '1px', borderColor: 'var(--cobalt)' },
  '.cm-content': { fontFamily: 'var(--font-mono)', caretColor: 'var(--accent-2)', padding: '10px 0' },
  '.cm-gutters': { background: 'transparent', border: 'none', color: 'var(--text-3)' },
  '.cm-activeLine': { background: 'color-mix(in srgb, var(--accent) 6%, transparent)' },
  '.cm-activeLineGutter': { background: 'transparent', color: 'var(--accent)' },
  '.cm-cursor': { borderLeftColor: 'var(--accent-2)', borderLeftWidth: '2px' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': { background: 'color-mix(in srgb, var(--cobalt) 28%, transparent) !important' },
  '.cm-matchingBracket': { background: 'color-mix(in srgb, var(--mint) 25%, transparent)', outline: '1px solid var(--mint)' },
  '.cm-error-line': { background: 'color-mix(in srgb, var(--bad) 18%, transparent)' },
  '.cm-scroller': { overflow: 'auto', lineHeight: '1.6' },
});

const setErrorLine = StateEffect.define<number | null>();
const errorField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    deco = deco.map(tr.changes);
    for (const e of tr.effects) {
      if (e.is(setErrorLine)) {
        const n = e.value;
        if (!n || n < 1 || n > tr.state.doc.lines) deco = Decoration.none;
        else deco = Decoration.set([Decoration.line({ class: 'cm-error-line' }).range(tr.state.doc.line(n).from)]);
      }
    }
    if (tr.docChanged) deco = Decoration.none;
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

function langExt(lang: Lang): Extension {
  if (lang === 'python') return [python(), indentUnit.of('    ')];
  return [javascript({ jsx: lang === 'jsx', typescript: lang === 'typescript' || lang === 'jsx' }), indentUnit.of('  ')];
}

export interface CodeEditorProps {
  value: string;
  onChange?: (v: string) => void;
  language: Lang;
  errorLine?: number | null;
  readOnly?: boolean;
  onRun?: () => void;
  minHeight?: number;
  ariaLabel?: string;
  autoFocus?: boolean;
}

export function CodeEditor({ value, onChange, language, errorLine, readOnly, onRun, minHeight = 180, ariaLabel = 'Code editor', autoFocus }: CodeEditorProps) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const cbs = useRef({ onChange, onRun });
  cbs.current = { onChange, onRun };
  const langComp = useRef(new Compartment());
  const roComp = useRef(new Compartment());

  useEffect(() => {
    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightActiveLine(),
        drawSelection(),
        history(),
        indentOnInput(),
        bracketMatching(),
        syntaxHighlighting(highlight),
        keymap.of([
          { key: 'Mod-Enter', run: () => (cbs.current.onRun?.(), true) },
          { key: 'Shift-Enter', run: () => (cbs.current.onRun?.(), true) },
          ...defaultKeymap,
          ...historyKeymap,
          indentWithTab,
        ]),
        langComp.current.of(langExt(language)),
        roComp.current.of([EditorState.readOnly.of(!!readOnly), EditorView.editable.of(!readOnly)]),
        errorField,
        theme,
        EditorView.contentAttributes.of({ 'aria-label': ariaLabel, spellcheck: 'false', autocapitalize: 'off', autocorrect: 'off' }),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) cbs.current.onChange?.(u.state.doc.toString());
        }),
        EditorView.theme({ '.cm-content, .cm-gutter': { minHeight: `${minHeight}px` } }),
      ],
    });
    const v = new EditorView({ state, parent: host.current! });
    view.current = v;
    if (autoFocus) v.focus();
    return () => v.destroy();
    // the editor is created once; props are synced by the effects below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const v = view.current;
    if (v && v.state.doc.toString() !== value) v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } });
  }, [value]);

  useEffect(() => {
    view.current?.dispatch({ effects: langComp.current.reconfigure(langExt(language)) });
  }, [language]);

  useEffect(() => {
    view.current?.dispatch({ effects: roComp.current.reconfigure([EditorState.readOnly.of(!!readOnly), EditorView.editable.of(!readOnly)]) });
  }, [readOnly]);

  useEffect(() => {
    view.current?.dispatch({ effects: setErrorLine.of(errorLine ?? null) });
  }, [errorLine]);

  return <div ref={host} className="code-editor" data-testid="editor" />;
}
