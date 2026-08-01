import type { Problem } from '../lib/lint';

interface Props {
  problems: Problem[];
  onGoTo(line: number, column: number): void;
  onFix(problem: Problem): void;
  onClose(): void;
}

export default function Problems({ problems, onGoTo, onFix, onClose }: Props) {
  return (
    <aside className="panel">
      <div className="panel-head">
        <span className="eyebrow">Problems</span>
        <span className="panel-count">{problems.length}</span>
        <button className="close" onClick={onClose} title="Hide problems">
          ×
        </button>
      </div>

      {problems.length === 0 ? (
        <p className="panel-empty">Nothing to fix. This document parses.</p>
      ) : (
        <ul className="problem-list">
          {problems.map((p, i) => (
            <li key={`${p.rule}-${p.line}-${p.column}-${i}`}>
              <div className={`problem ${p.severity}`}>
                <button className="problem-jump" onClick={() => onGoTo(p.line, p.column)}>
                  <span className="problem-where">
                    {p.line}:{p.column}
                  </span>
                  <span className="problem-message">{p.message}</span>
                  <span className="problem-rule">{p.rule}</span>
                </button>
                {p.fix && (
                  <button
                    className="problem-fix"
                    title={p.fix.label}
                    onClick={(e) => {
                      e.stopPropagation();
                      onFix(p);
                    }}
                  >
                    Fix
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
