import type { CursorState } from './Editor';

interface Props {
  cursor: CursorState;
  lines: number;
  indent: number;
  hasTabs: boolean;
  errors: number;
  warnings: number;
  checking: boolean;
  notice: string | null;
}

function count(n: number, word: string) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

export default function StatusBar({
  cursor,
  lines,
  indent,
  hasTabs,
  errors,
  warnings,
  checking,
  notice,
}: Props) {
  const state = errors > 0 ? 'error' : warnings > 0 ? 'warning' : 'ok';
  const label =
    checking
      ? 'Checking'
      : errors > 0
        ? [count(errors, 'error'), warnings > 0 ? count(warnings, 'warning') : null].filter(Boolean).join(', ')
        : warnings > 0
          ? count(warnings, 'warning')
          : 'Valid YAML';

  return (
    <footer className="status">
      <span className="status-item">
        Ln {cursor.line}, Col {cursor.column}
      </span>
      {cursor.selected > 0 && <span className="status-item">Sel {cursor.selected}</span>}
      <span className="status-item hide-sm">{count(lines, 'line')}</span>
      <span className="status-item" title={hasTabs ? 'Tabs found — Format converts them' : 'Spaces only'}>
        Spaces: {indent}
        {hasTabs && <span className="warn-flag"> · tabs</span>}
      </span>
      <span className="status-item hide-sm">YAML</span>

      <span className="spacer" />

      {notice && <span className="status-notice">{notice}</span>}
      <span className={`state ${state}`} aria-live="polite">
        <span className="state-dot" />
        {label}
      </span>
    </footer>
  );
}
