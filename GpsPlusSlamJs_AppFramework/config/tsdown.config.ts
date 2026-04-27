import { defineConfig } from 'tsdown';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');

export default defineConfig({
  entry: [
    resolve(projectRoot, 'src/index.ts'),
    resolve(projectRoot, 'src/ar/index.ts'),
    resolve(projectRoot, 'src/sensors/index.ts'),
    resolve(projectRoot, 'src/state/index.ts'),
    resolve(projectRoot, 'src/storage/index.ts'),
    resolve(projectRoot, 'src/ref-points/index.ts'),
    resolve(projectRoot, 'src/visualization/index.ts'),
    resolve(projectRoot, 'src/utils/index.ts'),
    resolve(projectRoot, 'src/types/index.ts'),
  ],
  format: ['esm'],
  dts: true,
  outDir: resolve(projectRoot, 'dist'),
  clean: true,
  outExtensions: () => ({ js: '.js', dts: '.d.ts' }),
  deps: {
    neverBundle: ['three', 'leaflet', 'h3-js', '@zip.js/zip.js'],
  },
});
