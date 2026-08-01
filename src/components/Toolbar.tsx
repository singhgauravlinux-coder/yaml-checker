import { TEMPLATES } from '../lib/templates';

interface Props {
  fileName: string;
  dirty: boolean;
  indent: number;
  theme: 'dark' | 'light';
  minimap: boolean;
  problemsOpen: boolean;
  problemCount: number;
  onNew(templateId: string): void;
  onOpen(): void;
  onSave(): void;
  onDownload(): void;
  onFormat(): void;
  onFind(): void;
  onIndent(indent: number): void;
  onTheme(): void;
  onMinimap(): void;
  onProblems(): void;
}

const modifier = /Mac|iP(hone|ad)/.test(navigator.platform || navigator.userAgent) ? '⌘' : 'Ctrl+';

export default function Toolbar(p: Props) {
  return (
    <header className="bar">
      <div className="brand">
        <svg width="12" height="22" viewBox="0 0 12 22" aria-hidden="true" className="plumb">
          <line x1="6" y1="0" x2="6" y2="13" />
          <path d="M6 13 L10 16 L6 22 L2 16 Z" />
        </svg>
        <span className="wordmark">Plumb</span>
      </div>

      <div className="file" title={p.dirty ? 'Unsaved changes' : 'Saved'}>
        <span className="file-name">{p.fileName}</span>
        {p.dirty && <span className="dot" aria-label="Unsaved changes" />}
      </div>

      <div className="spacer" />

      <div className="group">
        <label className="select new-menu" title="Start a new file from a valid template">
          <span>New</span>
          <select
            value=""
            onChange={(e) => {
              const id = e.target.value;
              e.target.value = '';
              if (id) p.onNew(id);
            }}
          >
            <option value="" disabled>
              Choose a template…
            </option>
            {TEMPLATES.map((t) => (
              <option key={t.id} value={t.id} title={t.hint}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="group">
        <button onClick={p.onOpen} title={`Open a file (${modifier}Shift+O)`}>
          Open
        </button>
        <button onClick={p.onSave} title={`Save (${modifier}S)`}>
          Save
        </button>
        <button onClick={p.onDownload} title="Download a copy">
          Download
        </button>
      </div>

      <div className="group">
        <button onClick={p.onFormat} title="Format and fix indentation (Shift+Alt+F)">
          Format
        </button>
        <button onClick={p.onFind} title={`Find and replace (${modifier}F)`}>
          Find
        </button>
      </div>

      <div className="group">
        <label className="select" title="Indentation width">
          <span>Indent</span>
          <select value={p.indent} onChange={(e) => p.onIndent(Number(e.target.value))}>
            <option value={2}>2</option>
            <option value={4}>4</option>
          </select>
        </label>
        <button onClick={p.onMinimap} aria-pressed={p.minimap} title="Toggle minimap">
          Map
        </button>
        <button onClick={p.onProblems} aria-pressed={p.problemsOpen} title="Toggle problems panel">
          Problems{p.problemCount > 0 ? ` ${p.problemCount}` : ''}
        </button>
        <button onClick={p.onTheme} title="Switch theme">
          {p.theme === 'dark' ? 'Light' : 'Dark'}
        </button>
      </div>
    </header>
  );
}
