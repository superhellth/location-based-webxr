import { defineConfig } from "vite";
import { resolve } from "node:path";

// TourBuilder is a multi-page app: one runnable demo page per component under
// components/<name>/index.html, plus a root gallery that links to them. Vite's
// dev server auto-serves every nested index.html by path (e.g.
// /components/billboard/ runs the billboard demo alone); the build emits each
// as its own HTML entry. Add one line to `input` per new component.
//
// AppFramework resolves through the pnpm workspace symlink; three comes from
// node_modules. A distinct port keeps it runnable alongside the minimal example
// (5180), starter (5181) and recorder.
export default defineConfig({
  server: {
    port: 5182,
    host: true,
  },
  build: {
    rollupOptions: {
      input: {
        gallery: resolve(__dirname, "index.html"),
        billboard: resolve(__dirname, "components/billboard/index.html"),
      },
    },
  },
});
