import { LineCounter, parseDocument } from 'yaml';

export type Severity = 'error' | 'warning';

export interface Problem {
  severity: Severity;
  /** Short rule id shown in the problems list, e.g. `tab-indent`. */
  rule: string;
  message: string;
  line: number; // 1-based
  column: number; // 1-based
  endLine: number;
  endColumn: number;
}

export interface LintResult {
  problems: Problem[];
  errors: number;
  warnings: number;
  /** Indent step detected in the document, used by the formatter and status bar. */
  indent: number;
  hasTabs: boolean;
  lines: number;
}

interface Line {
  n: number; // 1-based line number
  text: string;
  indent: number; // leading whitespace length
  body: string; // text without leading whitespace
  ignore: boolean; // blank, comment, or inside a block scalar
}

const BLOCK_SCALAR = /(?:^|\s)[|>][+-]?[0-9]?[+-]?[ \t]*(?:#.*)?$/;
const KEY_OR_ITEM = /^(?:-(?:\s|$)|[?](?:\s|$)|[^#\s].*?:(?:\s|$))/;
const SEQ_MARKER = /^-[ \t]+/;

/** Split the source into lines, marking out block-scalar bodies so rules skip them. */
function scan(text: string): Line[] {
  const out: Line[] = [];
  const raw = text.split('\n');
  let blockAt = -1; // indent of the key that opened a block scalar, or -1

  raw.forEach((line, i) => {
    const indent = /^[ \t]*/.exec(line)![0].length;
    const body = line.slice(indent);
    const blank = body.trim() === '';

    if (blockAt >= 0) {
      if (blank || indent > blockAt) {
        out.push({ n: i + 1, text: line, indent, body, ignore: true });
        return;
      }
      blockAt = -1;
    }
    if (!blank && BLOCK_SCALAR.test(body)) blockAt = indent;

    out.push({ n: i + 1, text: line, indent, body, ignore: blank || body.startsWith('#') });
  });

  return out;
}

/** Most common indentation step in the document; falls back to 2. */
function detectIndent(lines: Line[]): number {
  const counts = new Map<number, number>();
  let prev = 0;
  for (const l of lines) {
    if (l.ignore) continue;
    const step = l.indent - prev;
    if (step > 0) counts.set(step, (counts.get(step) ?? 0) + 1);
    prev = l.indent;
  }
  let best = 2;
  let top = 0;
  for (const [step, n] of counts) {
    if (n > top || (n === top && step < best)) {
      best = step;
      top = n;
    }
  }
  return best === 1 || best > 8 ? 2 : best;
}

/**
 * Lines that look like `key value` where a colon is missing. Only reported when the
 * document already fails to parse, so valid multi-line plain scalars stay quiet.
 */
function missingColons(lines: Line[]): Line[] {
  const keyIndents = new Set<number>();
  const hits: Line[] = [];

  for (const l of lines) {
    if (l.ignore) continue;
    let body = l.body;
    let indent = l.indent;

    let marker = SEQ_MARKER.exec(body);
    while (marker) {
      indent += marker[0].length;
      body = body.slice(marker[0].length);
      marker = SEQ_MARKER.exec(body);
    }
    if (body === '' || body === '-' || /^(-{3}|\.{3})/.test(body)) continue;

    if (/:(\s|$)/.test(body) || body.startsWith('? ')) {
      keyIndents.add(indent);
      continue;
    }
    // Anchors, tags, flow collections and quoted or folded scalars are not keys.
    if (/^[&*![{"'|>]/.test(body)) continue;
    // A bare word is probably a scalar; `two words` at mapping level is a lost colon.
    if (keyIndents.has(indent) && /\S[ \t]+\S/.test(body)) hits.push(l);
  }

  return hits;
}

/** Plain-language replacements for the parser's terser codes. */
const RESTATED: Record<string, string> = {
  BAD_INDENT: "Indentation doesn't line up with the block above.",
  BAD_SCALAR_START: 'A block scalar (| or >) must start on the line after its key.',
  BLOCK_AS_IMPLICIT_KEY: "Indentation doesn't line up with the block above, so this reads as a key with a nested map.",
  MULTILINE_IMPLICIT_KEY: 'A key cannot span two lines. Check the indentation and that the line above is complete.',
  MISSING_CHAR: 'Something is unclosed here.',
  BAD_ALIAS: 'This alias points at an anchor that has not been defined.',
};

/** Codes that describe the same misaligned line; only the first is worth showing. */
const STRUCTURAL = new Set(['BAD_INDENT', 'BLOCK_AS_IMPLICIT_KEY', 'MULTILINE_IMPLICIT_KEY', 'IMPOSSIBLE']);

function clean(message: string): string {
  return message.split('\n')[0].replace(/\s*at line \d+, column \d+:?$/, '').trim();
}

export function lint(text: string): LintResult {
  const lines = scan(text);
  const indent = detectIndent(lines);
  const problems: Problem[] = [];
  const tabLines = new Set<number>();
  let hasTabs = false;

  for (const l of lines) {
    if (l.ignore) continue;
    const tab = l.text.slice(0, l.indent).indexOf('\t');
    if (tab >= 0) {
      hasTabs = true;
      tabLines.add(l.n);
      problems.push({
        severity: 'error',
        rule: 'tab-indent',
        message: 'Tab used for indentation. YAML allows spaces only — press Format to convert.',
        line: l.n,
        column: tab + 1,
        endLine: l.n,
        endColumn: l.indent + 1,
      });
      continue;
    }
    if (l.indent === 0) continue;
    if (l.indent % indent !== 0 && KEY_OR_ITEM.test(l.body)) {
      problems.push({
        severity: 'warning',
        rule: 'indent-step',
        message: `Indented ${l.indent} ${l.indent === 1 ? 'space' : 'spaces'}, which is not a multiple of ${indent}.`,
        line: l.n,
        column: 1,
        endLine: l.n,
        endColumn: l.indent + 1,
      });
    }
  }

  const counter = new LineCounter();
  const doc = parseDocument(text, { lineCounter: counter, prettyErrors: true, uniqueKeys: true });

  const lostColons = doc.errors.length > 0 ? missingColons(lines) : [];
  const lostColonLines = new Set(lostColons.map((l) => l.n));

  for (const l of lostColons) {
    const key = /^[^ \t]+/.exec(l.body.replace(SEQ_MARKER, ''))?.[0] ?? '';
    problems.push({
      severity: 'error',
      rule: 'missing-colon',
      message: `Missing ":" after "${key}". A mapping entry needs the form key: value.`,
      line: l.n,
      column: l.indent + 1,
      endLine: l.n,
      endColumn: l.text.length + 1,
    });
  }

  const source = text.split('\n');
  const structuralLines = new Set<number>();

  for (const issue of [...doc.errors, ...doc.warnings]) {
    const start = issue.linePos?.[0] ?? counter.linePos(issue.pos[0]);
    const end = issue.linePos?.[1] ?? counter.linePos(issue.pos[1] ?? issue.pos[0]);
    if (lostColonLines.has(start.line)) continue;
    if (issue.code === 'TAB_AS_INDENT' && tabLines.has(start.line)) continue;
    if (issue.code && STRUCTURAL.has(issue.code)) {
      if (structuralLines.has(start.line)) continue;
      structuralLines.add(start.line);
    }

    let message = (issue.code && RESTATED[issue.code]) || clean(issue.message);
    if (issue.code === 'MISSING_CHAR') message = clean(issue.message);
    if (issue.code === 'DUPLICATE_KEY') {
      const key = source[start.line - 1]?.slice(start.col - 1).split(':')[0].trim();
      message = key ? `Duplicate key "${key}" in this mapping.` : message;
    }

    problems.push({
      severity: issue.name === 'YAMLWarning' ? 'warning' : 'error',
      rule: (issue.code ?? 'yaml').toLowerCase().replace(/_/g, '-'),
      message,
      line: start.line,
      column: start.col,
      endLine: end.line,
      endColumn: Math.max(end.col, start.col + 1),
    });
  }

  problems.sort((a, b) => a.line - b.line || a.column - b.column);

  return {
    problems,
    errors: problems.filter((p) => p.severity === 'error').length,
    warnings: problems.filter((p) => p.severity === 'warning').length,
    indent,
    hasTabs,
    lines: lines.length,
  };
}
