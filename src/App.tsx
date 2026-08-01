import { useCallback, useEffect, useRef, useState } from 'react';
import Editor, { type CursorState, type EditorHandle } from './components/Editor';
import Problems from './components/Problems';
import ProblemTape from './components/ProblemTape';
import StatusBar from './components/StatusBar';
import Toolbar from './components/Toolbar';
import { download, openFile, saveFile, type FileHandleLike } from './lib/files';
import { formatYaml } from './lib/format';
import { lint, type LintResult, type Problem } from './lib/lint';
import { SAMPLE_YAML } from './lib/sample';
import { TEMPLATES } from './lib/templates';

type Theme = 'dark' | 'light';

const storedTheme = (): Theme => {
  const saved = localStorage.getItem('plumb:theme');
  if (saved === 'dark' || saved === 'light') return saved;
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
};

export default function App() {
  const editor = useRef<EditorHandle>(null);

  const [text, setText] = useState(SAMPLE_YAML);
  const [result, setResult] = useState<LintResult>(() => lint(SAMPLE_YAML));
  const [checking, setChecking] = useState(false);
  const [cursor, setCursor] = useState<CursorState>({ line: 1, column: 1, selected: 0 });

  const [fileName, setFileName] = useState('workflow.yaml');
  const [handle, setHandle] = useState<FileHandleLike | undefined>();
  const [dirty, setDirty] = useState(false);

  const [theme, setTheme] = useState<Theme>(storedTheme);
  const [indent, setIndent] = useState(2);
  const [minimap, setMinimap] = useState(() => window.innerWidth > 720);
  const [problemsOpen, setProblemsOpen] = useState(() => window.innerWidth > 900);
  const [notice, setNotice] = useState<string | null>(null);

  const flash = useCallback((message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice((current) => (current === message ? null : current)), 2400);
  }, []);

  // Lint on a short trailing debounce so typing stays smooth on large files.
  useEffect(() => {
    setChecking(true);
    const timer = window.setTimeout(() => {
      setResult(lint(text));
      setChecking(false);
    }, 160);
    return () => window.clearTimeout(timer);
  }, [text]);

  useEffect(() => editor.current?.setProblems(result.problems), [result]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('plumb:theme', theme);
  }, [theme]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const load = useCallback((name: string, body: string, fileHandle?: FileHandleLike) => {
    editor.current?.setText(body);
    setText(body);
    setFileName(name);
    setHandle(fileHandle);
    setDirty(false);
    setIndent(lint(body).indent);
  }, []);

  const handleOpen = useCallback(async () => {
    const file = await openFile();
    if (!file) return;
    load(file.name, file.text, file.handle);
    flash(`Opened ${file.name}`);
  }, [flash, load]);

  const handleNew = useCallback(
    (templateId: string) => {
      const template = TEMPLATES.find((t) => t.id === templateId);
      if (!template) return;
      if (dirty && !window.confirm(`Discard unsaved changes in ${fileName} and start a new ${template.label}?`)) {
        return;
      }
      load(template.fileName, template.yaml);
      flash(`New ${template.label}`);
    },
    [dirty, fileName, flash, load],
  );

  const handleFix = useCallback(
    (problem: Problem) => {
      if (!problem.fix) return;
      const current = editor.current?.getText() ?? text;
      const fixed = problem.fix.apply(current);
      if (fixed === current) return;
      editor.current?.setText(fixed);
      setText(fixed);
      setDirty(true);
      flash(problem.fix.label);
    },
    [flash, text],
  );

  const handleSave = useCallback(async () => {
    const outcome = await saveFile(fileName, text, handle);
    if (!outcome.saved) return;
    setFileName(outcome.name);
    setHandle(outcome.handle);
    setDirty(false);
    flash(`Saved ${outcome.name}`);
  }, [fileName, flash, handle, text]);

  const handleDownload = useCallback(() => {
    download(fileName, text);
    flash(`Downloaded ${fileName}`);
  }, [fileName, flash, text]);

  const handleFormat = useCallback(async () => {
    const current = editor.current?.getText() ?? text;
    try {
      const formatted = await formatYaml(current, { indent });
      if (formatted === current) {
        flash('Already formatted');
        return;
      }
      editor.current?.setText(formatted);
      setText(formatted);
      flash('Formatted');
    } catch (error) {
      const detail = error instanceof Error ? error.message.split('\n')[0] : 'unknown error';
      flash(`Can't format: ${detail}`);
    }
  }, [flash, indent, text]);

  const goTo = useCallback((line: number, column: number) => editor.current?.goTo(line, column), []);

  // Shortcuts also work when focus sits outside the editor (toolbar, problems list).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void handleSave();
      } else if (meta && e.shiftKey && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        void handleOpen();
      } else if (e.shiftKey && e.altKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        void handleFormat();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleFormat, handleOpen, handleSave]);

  const onDrop = useCallback(
    async (e: React.DragEvent) => {
      const file = e.dataTransfer.files?.[0];
      if (!file) return;
      e.preventDefault();
      load(file.name, await file.text());
      flash(`Opened ${file.name}`);
    },
    [flash, load],
  );

  return (
    <div className="shell" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
      <Toolbar
        fileName={fileName}
        dirty={dirty}
        indent={indent}
        theme={theme}
        minimap={minimap}
        problemsOpen={problemsOpen}
        problemCount={result.problems.length}
        onNew={handleNew}
        onOpen={handleOpen}
        onSave={handleSave}
        onDownload={handleDownload}
        onFormat={handleFormat}
        onFind={() => editor.current?.openFind()}
        onIndent={setIndent}
        onTheme={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        onMinimap={() => setMinimap(!minimap)}
        onProblems={() => setProblemsOpen(!problemsOpen)}
      />

      <main className="workspace">
        <Editor
          ref={editor}
          initialText={SAMPLE_YAML}
          theme={theme === 'dark' ? 'plumb-dark' : 'plumb-light'}
          indent={indent}
          minimap={minimap}
          onChange={(value) => {
            setText(value);
            setDirty(true);
          }}
          onCursor={(next) =>
            setCursor((prev) =>
              prev.line === next.line && prev.column === next.column && prev.selected === next.selected
                ? prev
                : next,
            )
          }
          onSave={handleSave}
          onFormat={handleFormat}
          onOpen={handleOpen}
        />

        <ProblemTape
          problems={result.problems}
          lineCount={result.lines}
          cursorLine={cursor.line}
          onGoTo={goTo}
        />

        {problemsOpen && (
          <Problems
            problems={result.problems}
            onGoTo={goTo}
            onFix={handleFix}
            onClose={() => setProblemsOpen(false)}
          />
        )}
      </main>

      <StatusBar
        cursor={cursor}
        lines={result.lines}
        indent={indent}
        hasTabs={result.hasTabs}
        errors={result.errors}
        warnings={result.warnings}
        checking={checking}
        notice={notice}
      />
    </div>
  );
}
