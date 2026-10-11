import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { shareDevMiddleware } from "./share/dev";

export default defineConfig({
  plugins: [
    react(),
    {
      name: "share-preview",
      configureServer(server) {
        server.middlewares.use(shareDevMiddleware());
      },
    },
  ],
  server: {
    port: 5173,
    proxy: {
      "/api/metrics/gateways": {
        target: process.env.GONKA_GATEWAYS_PROXY || "http://127.0.0.1:8000",
        changeOrigin: true,
      },
      "/api": {
        target: process.env.GONKA_API_PROXY || "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
});
