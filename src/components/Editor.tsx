import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import monaco, { type ThemeName } from '../lib/monaco';
import type { Problem } from '../lib/lint';

export interface CursorState {
  line: number;
  column: number;
  selected: number;
}

export interface EditorHandle {
  getText(): string;
  /** Replaces the whole buffer as a single undoable edit. */
  setText(text: string): void;
  goTo(line: number, column: number): void;
  openFind(): void;
  setProblems(problems: Problem[]): void;
  focus(): void;
}

interface Props {
  initialText: string;
  theme: ThemeName;
  indent: number;
  minimap: boolean;
  onChange(text: string): void;
  onCursor(state: CursorState): void;
  onSave(): void;
  onFormat(): void;
  onOpen(): void;
}

const severity = {
  error: monaco.MarkerSeverity.Error,
  warning: monaco.MarkerSeverity.Warning,
} as const;

const Editor = forwardRef<EditorHandle, Props>(function Editor(props, ref) {
  const host = useRef<HTMLDivElement>(null);
  const editor = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  // Callbacks live in a ref so re-renders never force the editor to be rebuilt.
  const events = useRef(props);
  events.current = props;

  useEffect(() => {
    if (!host.current) return;

    const instance = monaco.editor.create(host.current, {
      value: props.initialText,
      language: 'yaml',
      theme: props.theme,
      automaticLayout: true,
      fontFamily: "'JetBrains Mono', 'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
      fontSize: 13,
      lineHeight: 21,
      tabSize: props.indent,
      insertSpaces: true,
      detectIndentation: false,
      renderWhitespace: 'boundary',
      guides: { indentation: true, highlightActiveIndentation: true, bracketPairs: false },
      folding: true,
      foldingStrategy: 'indentation',
      showFoldingControls: 'always',
      minimap: { enabled: props.minimap, renderCharacters: false, maxColumn: 90 },
      overviewRulerLanes: 0,
      overviewRulerBorder: false,
      hideCursorInOverviewRuler: true,
      scrollBeyondLastLine: false,
      smoothScrolling: true,
      cursorBlinking: 'smooth',
      renderLineHighlight: 'all',
      roundedSelection: false,
      padding: { top: 12, bottom: 32 },
      scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10, useShadows: false },
      bracketPairColorization: { enabled: false },
      quickSuggestions: false,
      wordBasedSuggestions: 'off',
      occurrencesHighlight: 'off',
      unicodeHighlight: { ambiguousCharacters: false },
      stickyScroll: { enabled: false },
      fixedOverflowWidgets: true,
    });
    editor.current = instance;

    const model = instance.getModel()!;
    const changed = model.onDidChangeContent(() => events.current.onChange(model.getValue()));

    const emitCursor = () => {
      const position = instance.getPosition();
      const selection = instance.getSelection();
      events.current.onCursor({
        line: position?.lineNumber ?? 1,
        column: position?.column ?? 1,
        selected: selection ? model.getValueInRange(selection).length : 0,
      });
    };
    emitCursor();
    const moved = instance.onDidChangeCursorPosition(emitCursor);
    const selected = instance.onDidChangeCursorSelection(emitCursor);

    instance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => events.current.onSave());
    instance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyO, () =>
      events.current.onOpen(),
    );
    instance.addCommand(monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.KeyF, () =>
      events.current.onFormat(),
    );

    instance.focus();

    return () => {
      changed.dispose();
      moved.dispose();
      selected.dispose();
      instance.dispose(); // also disposes the model it created
      editor.current = null;
    };
    // Built once; every prop change is applied through the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => monaco.editor.setTheme(props.theme), [props.theme]);

  useEffect(() => {
    editor.current?.updateOptions({ tabSize: props.indent });
    editor.current?.getModel()?.updateOptions({ tabSize: props.indent, insertSpaces: true });
  }, [props.indent]);

  useEffect(() => {
    editor.current?.updateOptions({ minimap: { enabled: props.minimap, renderCharacters: false } });
  }, [props.minimap]);

  useImperativeHandle(ref, () => ({
    getText: () => editor.current?.getValue() ?? '',
    setText(text) {
      const instance = editor.current;
      const model = instance?.getModel();
      if (!instance || !model || model.getValue() === text) return;
      instance.pushUndoStop();
      instance.executeEdits('plumb', [{ range: model.getFullModelRange(), text }]);
      instance.pushUndoStop();
    },
    goTo(line, column) {
      const instance = editor.current;
      if (!instance) return;
      instance.revealPositionInCenterIfOutsideViewport({ lineNumber: line, column });
      instance.setPosition({ lineNumber: line, column });
      instance.focus();
    },
    openFind() {
      const instance = editor.current;
      if (!instance) return;
      instance.focus();
      const action =
        instance.getAction('editor.action.startFindReplaceAction') ?? instance.getAction('actions.find');
      void action?.run();
    },
    setProblems(problems) {
      const model = editor.current?.getModel();
      if (!model) return;
      monaco.editor.setModelMarkers(
        model,
        'plumb',
        problems.map((p) => ({
          severity: severity[p.severity],
          message: `${p.message}  (${p.rule})`,
          startLineNumber: p.line,
          startColumn: p.column,
          endLineNumber: p.endLine,
          endColumn: p.endColumn,
        })),
      );
    },
    focus: () => editor.current?.focus(),
  }));

  return <div className="editor" ref={host} />;
});

export default Editor;
