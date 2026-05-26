import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  root: "src/browser",
  build: {
    outDir: "../../dist",
    emptyOutDir: true,
    target: "esnext",
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
  },
});
