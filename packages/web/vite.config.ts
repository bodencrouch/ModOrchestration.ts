import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const backend = "http://127.0.0.1:8471";

export default defineConfig({
  plugins: [react()],
  base: "./",
  build: { outDir: "dist", emptyOutDir: true },
  server: {
    proxy: {
      "/api": { target: backend, changeOrigin: true },
      "/ws": { target: backend.replace("http", "ws"), ws: true },
    },
  },
});
