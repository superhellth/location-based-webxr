import { defineConfig } from 'vite';

// Minimal Vite config: default entry is index.html in this directory.
// AppFramework resolves through the pnpm workspace symlink; the published
// gps-plus-slam-js comes from node_modules. No aliases needed.
export default defineConfig({
  server: {
    port: 5180,
  },
});
