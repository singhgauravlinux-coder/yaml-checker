import type { Problem } from '../lib/lint';

interface Props {
  problems: Problem[];
  lineCount: number;
  cursorLine: number;
  onGoTo(line: number, column: number): void;
}

/**
 * A scale drawing of the whole file: every problem sits at its true vertical position,
 * so a document's trouble is legible before you scroll to it.
 */
export default function ProblemTape({ problems, lineCount, cursorLine, onGoTo }: Props) {
  const span = Math.max(lineCount - 1, 1);
  const at = (line: number) => `${(Math.min(line, lineCount) - 1) * (100 / span)}%`;

  return (
    <div
      className="tape"
      onClick={(e) => {
        const box = e.currentTarget.getBoundingClientRect();
        const ratio = (e.clientY - box.top) / box.height;
        onGoTo(Math.max(1, Math.min(lineCount, Math.round(ratio * span) + 1)), 1);
      }}
    >
      <span className="tape-cursor" style={{ top: at(cursorLine) }} aria-hidden="true" />
      {problems.map((p, i) => (
        <button
          key={`${p.line}-${p.column}-${i}`}
          className={`tick ${p.severity}`}
          style={{ top: at(p.line) }}
          title={`Line ${p.line}: ${p.message}`}
          onClick={(e) => {
            e.stopPropagation();
            onGoTo(p.line, p.column);
          }}
        >
          <span className="sr-only">{`Line ${p.line}, ${p.message}`}</span>
        </button>
      ))}
    </div>
  );
}
