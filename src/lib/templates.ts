export interface Template {
  id: string;
  label: string;
  /** Suggested file name when this template is used to start a new document. */
  fileName: string;
  /** Short line shown under the label in the New menu. */
  hint: string;
  yaml: string;
}

/**
 * Starter documents for the "New" menu. Every Kubernetes template here already
 * satisfies the checks in lint.ts — `selector.matchLabels` matches
 * `template.metadata.labels`, and every pod template has at least one container —
 * so starting from one of these can't reproduce the "selector does not match
 * template" / "containers: Required value" class of apply-time error.
 */
export const TEMPLATES: Template[] = [
  {
    id: 'blank',
    label: 'Blank file',
    fileName: 'untitled.yaml',
    hint: 'Empty document',
    yaml: '',
  },
  {
    id: 'deployment',
    label: 'Deployment',
    fileName: 'deployment.yaml',
    hint: 'apps/v1 — selector, template, and one container all line up',
    yaml: `apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-app
  labels:
    app: my-app
spec:
  replicas: 2
  selector:
    matchLabels:
      app: my-app
  template:
    metadata:
      labels:
        app: my-app
    spec:
      containers:
        - name: my-app
          image: my-app:latest
          ports:
            - containerPort: 8080
          resources:
            requests:
              cpu: 100m
              memory: 128Mi
            limits:
              cpu: 500m
              memory: 256Mi
`,
  },
  {
    id: 'statefulset',
    label: 'StatefulSet',
    fileName: 'statefulset.yaml',
    hint: 'apps/v1 — with a headless service name and volumeClaimTemplates',
    yaml: `apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: my-app
  labels:
    app: my-app
spec:
  serviceName: my-app
  replicas: 3
  selector:
    matchLabels:
      app: my-app
  template:
    metadata:
      labels:
        app: my-app
    spec:
      containers:
        - name: my-app
          image: my-app:latest
          ports:
            - containerPort: 8080
          volumeMounts:
            - name: data
              mountPath: /data
  volumeClaimTemplates:
    - metadata:
        name: data
      spec:
        accessModes: [ReadWriteOnce]
        resources:
          requests:
            storage: 1Gi
`,
  },
  {
    id: 'daemonset',
    label: 'DaemonSet',
    fileName: 'daemonset.yaml',
    hint: 'apps/v1 — one pod per node',
    yaml: `apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: my-agent
  labels:
    app: my-agent
spec:
  selector:
    matchLabels:
      app: my-agent
  template:
    metadata:
      labels:
        app: my-agent
    spec:
      containers:
        - name: my-agent
          image: my-agent:latest
`,
  },
  {
    id: 'job',
    label: 'Job',
    fileName: 'job.yaml',
    hint: 'batch/v1 — one-off task with a restartPolicy',
    yaml: `apiVersion: batch/v1
kind: Job
metadata:
  name: my-job
spec:
  backoffLimit: 3
  template:
    spec:
      restartPolicy: Never
      containers:
        - name: my-job
          image: my-job:latest
`,
  },
  {
    id: 'cronjob',
    label: 'CronJob',
    fileName: 'cronjob.yaml',
    hint: 'batch/v1 — scheduled Job',
    yaml: `apiVersion: batch/v1
kind: CronJob
metadata:
  name: my-cronjob
spec:
  schedule: "0 * * * *"
  jobTemplate:
    spec:
      template:
        spec:
          restartPolicy: OnFailure
          containers:
            - name: my-cronjob
              image: my-cronjob:latest
`,
  },
  {
    id: 'service',
    label: 'Service',
    fileName: 'service.yaml',
    hint: 'v1 — selector targets the Deployment above',
    yaml: `apiVersion: v1
kind: Service
metadata:
  name: my-app
spec:
  selector:
    app: my-app
  ports:
    - name: http
      port: 80
      targetPort: 8080
`,
  },
  {
    id: 'ingress',
    label: 'Ingress',
    fileName: 'ingress.yaml',
    hint: 'networking.k8s.io/v1 — routes to the Service above',
    yaml: `apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: my-app
spec:
  rules:
    - host: my-app.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: my-app
                port:
                  number: 80
`,
  },
  {
    id: 'configmap',
    label: 'ConfigMap',
    fileName: 'configmap.yaml',
    hint: 'v1 — key/value config',
    yaml: `apiVersion: v1
kind: ConfigMap
metadata:
  name: my-app-config
data:
  LOG_LEVEL: info
`,
  },
  {
    id: 'secret',
    label: 'Secret',
    fileName: 'secret.yaml',
    hint: 'v1 — Opaque, stringData for plain values',
    yaml: `apiVersion: v1
kind: Secret
metadata:
  name: my-app-secret
type: Opaque
stringData:
  API_KEY: replace-me
`,
  },
  {
    id: 'namespace',
    label: 'Namespace',
    fileName: 'namespace.yaml',
    hint: 'v1',
    yaml: `apiVersion: v1
kind: Namespace
metadata:
  name: my-namespace
`,
  },
  {
    id: 'pvc',
    label: 'PersistentVolumeClaim',
    fileName: 'pvc.yaml',
    hint: 'v1 — request storage from a StorageClass',
    yaml: `apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: my-app-data
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 1Gi
`,
  },
  {
    id: 'hpa',
    label: 'HorizontalPodAutoscaler',
    fileName: 'hpa.yaml',
    hint: 'autoscaling/v2 — scaleTargetRef points at the Deployment above',
    yaml: `apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: my-app
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: my-app
  minReplicas: 2
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
`,
  },
  {
    id: 'github-actions',
    label: 'GitHub Actions workflow',
    fileName: 'workflow.yaml',
    hint: 'CI pipeline, not Kubernetes',
    yaml: `name: build
on:
  push:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Install and test
        run: |
          npm ci
          npm test -- --run
`,
  },
];
