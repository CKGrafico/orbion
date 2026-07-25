import { defineConfig } from "electron-vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

export default defineConfig({
  main: {
    build: {
      sourcemap: false,
      rollupOptions: {
        external: [
          "electron",
          "electron-store",
          "@opencode-ai/sdk",
          /^node:/,
        ],
      },
    },
  },
  preload: {
    build: {
      sourcemap: false,
      rollupOptions: {
        output: {
          format: "cjs",
          entryFileNames: "index.cjs",
        },
      },
    },
  },
  renderer: {
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "src/renderer/src"),
      },
    },
    plugins: [react(), tailwindcss()],
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes("highlight.js")) return "highlight";
            if (id.includes("react-markdown") || id.includes("rehype-highlight")) return "markdown";
            if (id.includes("/react-dom") || id.includes("/react/")) return "react-vendor";
            if (id.includes("@radix-ui/react-") || id.includes("class-variance-authority") || id.includes("clsx") || id.includes("tailwind-merge")) return "radix-ui";
          },
        },
      },
    },
  },
});
