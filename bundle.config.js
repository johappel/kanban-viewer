import { defineConfig } from "vite";

export default defineConfig({
  build: {
    lib: {
      entry: "./src/index.mjs",
      name: "NostreKanbanViewer",
      formats: ["es"],
      fileName: () => "nostre-kanban-viewer.esm.js",
    },
    outDir: "dist-bundle",
    emptyOutDir: true,
    rollupOptions: {
      // Keep dependencies external – resolved via import map at runtime
      external: ["@nostr-dev-kit/ndk", "nostr-tools", "marked"],
      output: {
        inlineDynamicImports: true,
      },
    },
    minify: "esbuild",
  },
});
