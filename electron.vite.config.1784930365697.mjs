// electron.vite.config.ts
import { defineConfig } from "electron-vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
var __electron_vite_injected_dirname = "C:\\Projects\\Personal\\loop-task-app";
var electron_vite_config_default = defineConfig({
  main: {
    build: {
      sourcemap: false,
      rollupOptions: {
        external: [
          "electron",
          "electron-store",
          "@opencode-ai/sdk",
          /^node:/
        ]
      }
    }
  },
  preload: {
    build: {
      sourcemap: false,
      rollupOptions: {
        output: {
          format: "cjs",
          entryFileNames: "index.cjs"
        }
      }
    }
  },
  renderer: {
    resolve: {
      alias: {
        "@": path.resolve(__electron_vite_injected_dirname, "src/renderer/src")
      }
    },
    plugins: [react(), tailwindcss()],
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            "highlight": ["highlight.js"],
            "markdown": ["react-markdown", "rehype-highlight"],
            "react-vendor": ["react", "react-dom"],
            "intl": ["react-intl"],
            "radix-ui": [
              /@radix-ui\/react-/,
              "class-variance-authority",
              "clsx",
              "tailwind-merge"
            ]
          }
        }
      }
    }
  }
});
export {
  electron_vite_config_default as default
};
