import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Declared locally so the config stays free of @types/node.
declare const process: { env: Record<string, string | undefined> };


export default defineConfig({
  // Serve from a sub-path by building with BASE_PATH=/yaml/ (see k8s/ingress.yaml).
  base: process.env.BASE_PATH || '/',
  plugins: [react()],
  worker: { format: 'es' },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 3000, // Monaco itself is ~2.8 MB / 720 kB gzipped
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('monaco-editor')) return 'monaco';
          if (id.includes('prettier')) return 'prettier';
          if (id.includes('/yaml/')) return 'yaml';
          return undefined;
        },
      },
    },
  },
});
