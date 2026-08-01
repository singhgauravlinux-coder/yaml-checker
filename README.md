# Plumb — YAML editor & linter

A browser-based YAML editor: Monaco for editing, the `yaml` parser for live diagnostics,
Prettier for formatting. No backend, no telemetry, no server round-trips.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # static bundle in dist/
npm run preview
```

## What it does

- **Live validation** on a 160 ms trailing debounce: syntax errors, misaligned
  indentation, tabs used as indentation, duplicate keys, and missing colons.
- **Problems panel** with line:column, a plain-language message, and the rule id.
  Clicking an entry moves the cursor there.
- **Problem tape** — the narrow strip beside the editor plots every problem at its true
  position in the file, so you can see where the trouble is before scrolling. Click
  anywhere on it to jump to that part of the document.
- **Format** (Prettier) normalises indentation, spacing, and quoting. Leading tabs are
  converted to spaces first so a tab-broken file can still be repaired in one press.
  If the document cannot be parsed, the status bar reports why instead of mangling it.
- **Files**: open, edit, save in place, or download. Drag a `.yaml` file onto the window
  to open it.
- Find & replace, line numbers, indentation-based folding, minimap, dark/light theme,
  and a status bar with cursor position, line count, indent width, and validation state.

### Shortcuts

| Action | Keys |
| --- | --- |
| Save | `⌘/Ctrl+S` |
| Open | `⌘/Ctrl+Shift+O` |
| Format | `Shift+Alt+F` |
| Find / replace | `⌘/Ctrl+F` · `⌘/Ctrl+H` |
| Go to line | `⌘/Ctrl+G` |
| Fold / unfold | `⌘/Ctrl+K` then `⌘/Ctrl+L` |

## Rules

| Rule | Severity | Source |
| --- | --- | --- |
| `tab-indent` | error | leading tabs on a structural line (tabs inside block scalars and comments are legal and ignored) |
| `missing-colon` | error | a `key value` line at mapping level, reported only when the document already fails to parse, which keeps valid multi-line plain scalars quiet |
| `duplicate-key` | error | `yaml` parser, with the offending key named |
| `indent-step` | warning | indentation that is not a multiple of the document's detected step |
| everything else | error/warning | `yaml` parser codes (`bad-indent`, `missing-char`, `bad-alias`, …), with the most common ones restated in plain language |

Diagnostics are also pushed to Monaco as markers, so squiggles, hover messages, and
`F8` / `Shift+F8` marker navigation all work.

## Container

```bash
docker build -t plumb:local .          # or: make image
docker compose up --build              # http://localhost:8080
```

Two stages: `node:22-alpine` builds `dist/`, then `nginxinc/nginx-unprivileged`
serves it as uid 101 on port 8080 — no root, no `NET_BIND_SERVICE`. The runtime
image carries the static files and nothing else: no Node, no npm, no source.

nginx config lives in `docker/`. Fingerprinted assets under `/assets/` are cached for
a year and marked immutable; `index.html` is `no-cache`, so a rollout never leaves a
client pinned to an old asset manifest. `/healthz` answers probes. Security headers
sit in an `include` snippet because nginx drops inherited `add_header` directives the
moment a location declares its own — the CSP allows same-origin scripts, a same-origin
worker, and inline styles, which is what Monaco needs and nothing more.

The image pins `worker_processes 2`. The upstream autotune script rewrites
`nginx.conf` at start-up, which the read-only root filesystem below forbids.

## Kubernetes

```bash
kubectl apply -k k8s                              # namespace plumb
kubectl -n plumb port-forward svc/plumb 8080:80   # or: make forward
```

Set your registry first — `k8s/kustomization.yaml` carries the image name and tag in
one place, and `make deploy IMAGE=… TAG=…` rewrites it before applying.

`k8s/` holds a Deployment (2 replicas, surge-only rollout, start-up/readiness/liveness
probes on `/healthz`), a ClusterIP Service, an Ingress, an HPA (2–6 pods on CPU), and
a PodDisruptionBudget. The namespace enforces the `restricted` Pod Security Standard
and the pods clear it: non-root uid 101, all capabilities dropped, no privilege
escalation, `RuntimeDefault` seccomp, and a read-only root filesystem with `emptyDir`
mounts for the only two paths nginx writes to, `/tmp` and `/var/cache/nginx`.

Requests are 50m CPU / 32Mi; the CPU request is deliberately not tiny, since the HPA
scales against it. Ingress defaults to host `yaml.example.com` with TLS commented out
for cert-manager. To serve under a sub-path instead, build with
`--build-arg BASE_PATH=/yaml/` and use the rewrite rule noted in `k8s/ingress.yaml` —
the base path reaches the worker and lazy chunk URLs too, not just the entry script.

Run `make help` for the full set of targets.

## Layout

```
Dockerfile               node build -> unprivileged nginx
compose.yaml
Makefile                 dev, image, deploy targets
docker/
  nginx.conf             static serving, caching, /healthz
  security-headers.conf  CSP and friends, included per location
k8s/
  kustomization.yaml     image name and tag live here
  namespace.yaml service.yaml deployment.yaml
  ingress.yaml hpa.yaml pdb.yaml
src/
  App.tsx                  state, file actions, shortcuts
  main.tsx
  styles.css               design tokens + layout
  components/
    Editor.tsx             Monaco wrapper with an imperative handle
    Toolbar.tsx
    Problems.tsx
    ProblemTape.tsx
    StatusBar.tsx
  lib/
    monaco.ts              curated Monaco features, YAML language, themes
    lint.ts                parser errors + custom rules
    format.ts              tab repair + Prettier
    files.ts               File System Access API with download fallback
    sample.ts
```

## Notes

- **Bundle**: Monaco dominates at ~721 kB gzipped. `src/lib/monaco.ts` imports only the
  contributions this app uses rather than `monaco-editor` or `editor.all.js`, which would
  also pull in the TypeScript, JSON, CSS, and HTML language services. Prettier (~71 kB
  gzipped) is fetched the first time you press Format. App code is ~53 kB gzipped.
- **Formatting**: `prettier-plugin-yaml` was for Prettier 2. Prettier 3 ships the YAML
  printer in core, imported here as `prettier/plugins/yaml`.
- **Saving in place** uses the File System Access API (Chrome, Edge, Opera). Firefox and
  Safari fall back to a download, and the file picker falls back to `<input type="file">`.
- **Folding** uses Monaco's indentation strategy, which suits YAML and needs no language
  server.
