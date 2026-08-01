import { LineCounter, parseDocument, isMap, isSeq, isScalar } from 'yaml';
import type { Document, YAMLMap } from 'yaml';

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
  /**
   * When set, the Problems panel shows a "Fix" button. Applying it re-parses the
   * current text, makes the one targeted change, and re-serializes — comments and
   * key order elsewhere in the file are left alone.
   */
  fix?: { label: string; apply: (text: string) => string };
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

/** Proper PascalCase kind -> the apiVersion(s) it actually lives under. */
const KIND_INFO: Record<string, string[]> = {
  Namespace: ['v1'], Pod: ['v1'], Service: ['v1'], ConfigMap: ['v1'], Secret: ['v1'],
  ServiceAccount: ['v1'], Endpoints: ['v1'], Node: ['v1'], LimitRange: ['v1'],
  ResourceQuota: ['v1'], PersistentVolume: ['v1'], PersistentVolumeClaim: ['v1'],
  ReplicationController: ['v1'], Event: ['v1', 'events.k8s.io/v1'],
  Deployment: ['apps/v1'], StatefulSet: ['apps/v1'], DaemonSet: ['apps/v1'], ReplicaSet: ['apps/v1'],
  Job: ['batch/v1'], CronJob: ['batch/v1'],
  Ingress: ['networking.k8s.io/v1'], NetworkPolicy: ['networking.k8s.io/v1'],
  Role: ['rbac.authorization.k8s.io/v1'], RoleBinding: ['rbac.authorization.k8s.io/v1'],
  ClusterRole: ['rbac.authorization.k8s.io/v1'], ClusterRoleBinding: ['rbac.authorization.k8s.io/v1'],
  HorizontalPodAutoscaler: ['autoscaling/v2', 'autoscaling/v1'],
  PodDisruptionBudget: ['policy/v1'],
  StorageClass: ['storage.k8s.io/v1'],
  CustomResourceDefinition: ['apiextensions.k8s.io/v1'],
};

/** Lowercase kind -> correct PascalCase, derived from KIND_INFO. */
const KNOWN_KINDS: Record<string, string> = Object.fromEntries(
  Object.keys(KIND_INFO).map((k) => [k.toLowerCase(), k])
);

interface TopLevelValue {
  line: Line;
  key: string; // the key as actually written in the document (may be wrong-case)
  value: string;
}

/**
 * Finds a `key: value` pair at column 0 (document root), matching the key
 * case-insensitively so a wrong-case key (e.g. `apiversion:`) is still found —
 * Kubernetes field names are case-sensitive, so this is itself worth flagging.
 */
function findTopLevelKey(lines: Line[], canonicalKey: string): TopLevelValue | undefined {
  const re = /^([A-Za-z][A-Za-z0-9_-]*):\s*(.+?)\s*(#.*)?$/;
  for (const l of lines) {
    if (l.ignore || l.indent !== 0) continue;
    const m = re.exec(l.body);
    if (m && m[1].toLowerCase() === canonicalKey.toLowerCase()) {
      return { line: l, key: m[1], value: m[2].replace(/^["']|["']$/g, '') };
    }
  }
  return undefined;
}

/** Builds a Problem pointing at the key portion of a `key: value` line. */
function keyProblem(kv: TopLevelValue, message: string, rule: string, severity: Severity): Problem {
  return {
    severity,
    rule,
    message,
    line: kv.line.n,
    column: kv.line.indent + 1,
    endLine: kv.line.n,
    endColumn: kv.line.indent + kv.key.length + 1,
  };
}

/** Builds a Problem pointing at the value portion of a `key: value` line. */
function valueProblem(kv: TopLevelValue, message: string, rule: string, severity: Severity): Problem {
  const offset = kv.line.body.indexOf(kv.value, kv.key.length);
  const col = kv.line.indent + (offset >= 0 ? offset : kv.key.length + 2) + 1;
  return {
    severity,
    rule,
    message,
    line: kv.line.n,
    column: col,
    endLine: kv.line.n,
    endColumn: kv.line.text.length + 1,
  };
}

/**
 * Kubernetes-specific checks:
 *  - `apiVersion`/`kind` are case-sensitive and, for built-in resources, must match an
 *    exact registered spelling.
 *  - Each built-in kind lives under one specific apiVersion (e.g. Deployment is only
 *    valid under apps/v1, never v1) — getting the kind right but the group wrong parses
 *    fine as YAML and still gets rejected by the cluster ("groupVersion shouldn't be
 *    empty" in Rancher, "no matches for kind" with kubectl).
 * A file can be perfectly valid YAML and still fail on either of these before deploy.
 */
function lintKubernetes(lines: Line[]): Problem[] {
  const problems: Problem[] = [];
  const kind = findTopLevelKey(lines, 'kind');
  const apiVersion = findTopLevelKey(lines, 'apiVersion');
  if (!kind && !apiVersion) return problems;

  if (kind && kind.key !== 'kind') {
    problems.push(
      keyProblem(kind, `Kubernetes field names are case-sensitive. "${kind.key}" should be "kind".`, 'k8s-field-case', 'error')
    );
  }
  if (apiVersion && apiVersion.key !== 'apiVersion') {
    problems.push(
      keyProblem(
        apiVersion,
        `Kubernetes field names are case-sensitive. "${apiVersion.key}" should be "apiVersion".`,
        'k8s-field-case',
        'error'
      )
    );
  }

  let properKind: string | undefined;

  if (kind && kind.value) {
    const proper = KNOWN_KINDS[kind.value.toLowerCase()];
    if (proper && kind.value !== proper) {
      problems.push(
        valueProblem(
          kind,
          `Kubernetes "kind" values are case-sensitive. "${kind.value}" isn't recognized — did you mean "${proper}"?`,
          'k8s-kind-case',
          'error'
        )
      );
      properKind = proper;
    } else if (!proper && /^[a-z]/.test(kind.value)) {
      problems.push(
        valueProblem(
          kind,
          `Kubernetes "kind" values are PascalCase (e.g. "Deployment", "Service"). "${kind.value}" looks lowercase and won't match any built-in resource type.`,
          'k8s-kind-case',
          'warning'
        )
      );
    } else {
      properKind = proper ?? kind.value;
    }
  }

  if (apiVersion && /[A-Z]/.test(apiVersion.value)) {
    problems.push(
      valueProblem(
        apiVersion,
        `Kubernetes "apiVersion" values are lowercase. "${apiVersion.value}" should be "${apiVersion.value.toLowerCase()}".`,
        'k8s-apiversion-case',
        'error'
      )
    );
  } else if (apiVersion && properKind && KIND_INFO[properKind]) {
    const expected = KIND_INFO[properKind];
    if (!expected.includes(apiVersion.value)) {
      problems.push(
        valueProblem(
          apiVersion,
          `"${properKind}" belongs to apiVersion "${expected[0]}", not "${apiVersion.value}". The kind and apiVersion don't match, so the cluster won't recognize this resource.`,
          'k8s-apiversion-mismatch',
          'error'
        )
      );
    }
  }

  return problems;
}

/** Kinds whose pod template must be selected by `spec.selector.matchLabels`. */
const SELECTOR_KINDS = new Set(['Deployment', 'StatefulSet', 'DaemonSet', 'ReplicaSet']);
/** Kinds that carry a `spec.template` pod template at all. */
const TEMPLATE_KINDS = new Set([...SELECTOR_KINDS, 'Job']);

/** Reads a YAMLMap's scalar `key: value` pairs into a plain string/string object. */
function labelsOf(map: YAMLMap | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!map) return out;
  for (const pair of map.items) {
    if (isScalar(pair.key) && isScalar(pair.value)) {
      out[String(pair.key.value)] = String(pair.value.value);
    }
  }
  return out;
}

function sameLabels(a: Record<string, string>, b: Record<string, string>): boolean {
  const ak = Object.keys(a);
  const bk = Object.keys(b);
  return ak.length === bk.length && ak.every((k) => a[k] === b[k]);
}

/** Builds a Problem from a parsed node's character range (falls back to line 1). */
function nodeProblem(
  node: unknown,
  message: string,
  rule: string,
  severity: Severity,
  counter: LineCounter,
  fix?: Problem['fix'],
): Problem {
  const range = (node as { range?: readonly [number, number, number] } | undefined)?.range;
  if (!range) {
    return { severity, rule, message, line: 1, column: 1, endLine: 1, endColumn: 2, fix };
  }
  const start = counter.linePos(range[0]);
  const end = counter.linePos(range[1]);
  return { severity, rule, message, line: start.line, column: start.col, endLine: end.line, endColumn: end.col, fix };
}

/** Re-parses `text`, applies one targeted mutation, and re-serializes it. */
function mutate(mutator: (doc: Document) => void): (text: string) => string {
  return (text: string) => {
    const doc = parseDocument(text);
    mutator(doc);
    return String(doc);
  };
}

/**
 * Deployment/StatefulSet/DaemonSet/ReplicaSet/Job all embed a pod template, and the
 * cluster rejects the whole manifest — with an error that names none of these fields
 * intuitively — if any of the following don't line up:
 *  - `spec.selector` is missing (controllers other than Job require one)
 *  - `spec.selector.matchLabels` doesn't match `spec.template.metadata.labels`
 *  - `spec.template.spec.containers` is missing or empty
 * This runs only once the document already parses as valid YAML, since it needs the
 * real node tree (not just line text) to check nested structure.
 */
function lintWorkloadShape(doc: Document, counter: LineCounter): Problem[] {
  const problems: Problem[] = [];
  const root = doc.contents;
  if (!isMap(root)) return problems;

  const kindPair = root.items.find((p) => isScalar(p.key) && p.key.value === 'kind');
  const kind = kindPair && isScalar(kindPair.value) ? String(kindPair.value.value) : undefined;
  if (!kind || !TEMPLATE_KINDS.has(kind)) return problems;

  const specPair = root.items.find((p) => isScalar(p.key) && p.key.value === 'spec');
  const spec = specPair && isMap(specPair.value) ? specPair.value : undefined;
  if (!spec) {
    problems.push(nodeProblem(kindPair?.value, `"${kind}" needs a "spec" section with a pod "template".`, 'k8s-missing-spec', 'error', counter));
    return problems;
  }

  const templatePair = spec.items.find((p) => isScalar(p.key) && p.key.value === 'template');
  const template = templatePair && isMap(templatePair.value) ? templatePair.value : undefined;

  const templateMetaPair = template?.items.find((p) => isScalar(p.key) && p.key.value === 'metadata');
  const templateMeta = templateMetaPair && isMap(templateMetaPair.value) ? templateMetaPair.value : undefined;
  const templateLabelsPair = templateMeta?.items.find((p) => isScalar(p.key) && p.key.value === 'labels');
  const templateLabels = templateLabelsPair && isMap(templateLabelsPair.value) ? templateLabelsPair.value : undefined;

  if (SELECTOR_KINDS.has(kind)) {
    const selectorPair = spec.items.find((p) => isScalar(p.key) && p.key.value === 'selector');
    const selector = selectorPair && isMap(selectorPair.value) ? selectorPair.value : undefined;
    const matchLabelsPair = selector?.items.find((p) => isScalar(p.key) && p.key.value === 'matchLabels');
    const matchLabels = matchLabelsPair && isMap(matchLabelsPair.value) ? matchLabelsPair.value : undefined;
    const matchExpressionsPair = selector?.items.find((p) => isScalar(p.key) && p.key.value === 'matchExpressions');

    if (!selector) {
      problems.push(
        nodeProblem(
          specPair?.value,
          `"${kind}" is missing "spec.selector". Kubernetes needs it to know which pods this ${kind.toLowerCase()} owns.`,
          'k8s-missing-selector',
          'error',
          counter,
          {
            label: 'Add selector from template labels',
            apply: mutate((d) => {
              const labels = labelsOf(templateLabels);
              d.setIn(['spec', 'selector', 'matchLabels'], Object.keys(labels).length ? labels : { app: 'app' });
            }),
          },
        ),
      );
    } else if (!matchLabels && !matchExpressionsPair) {
      problems.push(
        nodeProblem(
          selectorPair?.value,
          `"spec.selector" needs "matchLabels" (or "matchExpressions") so Kubernetes knows which pods to select.`,
          'k8s-missing-selector',
          'error',
          counter,
          {
            label: 'Add matchLabels from template labels',
            apply: mutate((d) => {
              const labels = labelsOf(templateLabels);
              d.setIn(['spec', 'selector', 'matchLabels'], Object.keys(labels).length ? labels : { app: 'app' });
            }),
          },
        ),
      );
    } else if (matchLabels && !sameLabels(labelsOf(matchLabels), labelsOf(templateLabels))) {
      problems.push(
        nodeProblem(
          matchLabelsPair?.value,
          `"spec.selector.matchLabels" doesn't match "spec.template.metadata.labels" — the ${kind.toLowerCase()} would be rejected for not selecting its own pods.`,
          'k8s-selector-mismatch',
          'error',
          counter,
          {
            label: 'Make selector match template labels',
            apply: mutate((d) => {
              const freshTemplateLabels = labelsOf(templateLabels);
              d.setIn(
                ['spec', 'selector', 'matchLabels'],
                Object.keys(freshTemplateLabels).length ? freshTemplateLabels : { app: 'app' },
              );
            }),
          },
        ),
      );
    }

    if (selector && matchLabels && !templateLabels) {
      problems.push(
        nodeProblem(
          (templateMetaPair ?? templatePair)?.value,
          `"spec.template.metadata.labels" is missing. It must match "spec.selector.matchLabels" or the pods this ${kind.toLowerCase()} creates won't belong to it.`,
          'k8s-missing-template-labels',
          'error',
          counter,
          {
            label: 'Copy labels from selector',
            apply: mutate((d) => {
              const labels = labelsOf(matchLabels);
              d.setIn(['spec', 'template', 'metadata', 'labels'], Object.keys(labels).length ? labels : { app: 'app' });
            }),
          },
        ),
      );
    }
  }

  if (!template) {
    problems.push(
      nodeProblem(specPair?.value, `"${kind}" is missing "spec.template", its pod template.`, 'k8s-missing-template', 'error', counter),
    );
    return problems;
  }

  const templateSpecPair = template.items.find((p) => isScalar(p.key) && p.key.value === 'spec');
  const templateSpec = templateSpecPair && isMap(templateSpecPair.value) ? templateSpecPair.value : undefined;
  if (!templateSpec) {
    problems.push(
      nodeProblem(
        templatePair?.value,
        `"spec.template" is missing its own "spec" — that's where "containers" belongs.`,
        'k8s-missing-containers',
        'error',
        counter,
      ),
    );
    return problems;
  }

  const containersPair = templateSpec.items.find((p) => isScalar(p.key) && p.key.value === 'containers');
  const containers = containersPair && isSeq(containersPair.value) ? containersPair.value : undefined;
  const defaultContainer = { name: 'app', image: 'nginx:latest' };

  if (!containers) {
    problems.push(
      nodeProblem(
        templateSpecPair?.value,
        `"spec.template.spec.containers" is required — a pod template with no containers is rejected.`,
        'k8s-missing-containers',
        'error',
        counter,
        {
          label: 'Add a placeholder container',
          apply: mutate((d) => d.setIn(['spec', 'template', 'spec', 'containers'], [defaultContainer])),
        },
      ),
    );
  } else if (containers.items.length === 0) {
    problems.push(
      nodeProblem(
        containersPair?.value,
        `"spec.template.spec.containers" is empty — at least one container is required.`,
        'k8s-empty-containers',
        'error',
        counter,
        {
          label: 'Add a placeholder container',
          apply: mutate((d) => d.setIn(['spec', 'template', 'spec', 'containers'], [defaultContainer])),
        },
      ),
    );
  }

  return problems;
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

  if (doc.errors.length === 0) {
    problems.push(...lintKubernetes(lines));
    problems.push(...lintWorkloadShape(doc, counter));
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
