import { defineConfig } from "vite";

// Billboard-demo Vite config. AppFramework resolves through the pnpm workspace
// symlink; three comes from node_modules. A distinct port keeps it runnable
// alongside the minimal example (5180), starter (5181) and recorder.
export default defineConfig({
  server: {
    port: 5182,
    host: true,
  },
});
