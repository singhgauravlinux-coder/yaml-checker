export const SAMPLE_YAML = `# Plumb — a YAML editor that lints while you type.
# Try breaking this file: use a tab, drop a colon, repeat a key.

name: deploy
on:
  push:
    branches: [main]
    tags:
      - "v*"

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: acme/api

jobs:
  build:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
      - name: Set up Node
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - name: Install and test
        run: |
          npm ci
          npm run build
          npm test -- --run
      - name: Publish image
        if: github.ref == 'refs/heads/main'
        run: docker build -t $REGISTRY/$IMAGE_NAME:latest .
`;
