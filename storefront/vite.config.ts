import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { defineConfig, type Plugin, type ViteDevServer } from "vite";

const PROJECT_ROOT = import.meta.dirname;

function vitePluginStorageProxy(): Plugin {
  return {
    name: "manus-storage-proxy",
    configureServer(server: ViteDevServer) {
      server.middlewares.use("/manus-storage", async (req, res, next) => {
        const name = path.basename(decodeURIComponent((req.url ?? "").split("?")[0]));
        if (!name || name.includes("..") || name.includes("/")) {
          return next();
        }
        const file = path.join(IMAGES_DIR, name);
        if (fs.existsSync(file)) {
          res.sendFile(file);
        } else {
          res.status(404).type("text/plain").end("Not found");
        }
      });
    },
  };
}

// =============================================================================
// Safi Time - Local Product Images
// Serves /manus-storage/<file> from the Images/ folder at the project root.
// Dev: middleware proxy. Build: copies Images/ into dist/public/manus-storage/.
// =============================================================================

const IMAGES_DIR = path.join(PROJECT_ROOT, "Images");
const IMAGES_MOUNT = "/manus-storage";

function vitePluginLocalImages(): Plugin {
  return {
    name: "safi-local-images",

    configureServer(server: ViteDevServer) {
      server.middlewares.use(IMAGES_MOUNT, (req, res, next) => {
        const name = path.basename(decodeURIComponent((req.url ?? "").split("?")[0]));
        if (!name || name.includes("..") || name.includes("/")) {
          return next();
        }
        const file = path.join(IMAGES_DIR, name);
        if (fs.existsSync(file)) {
          res.sendFile(file);
        } else {
          res.status(404).type("text/plain").end("Not found");
        }
      });
    },

    closeBundle() {
      if (!fs.existsSync(IMAGES_DIR)) return;
      const outDir = path.join(PROJECT_ROOT, "dist", "public", IMAGES_MOUNT.replace(/^\//, ""));
      fs.mkdirSync(outDir, { recursive: true });
      for (const entry of fs.readdirSync(IMAGES_DIR)) {
        const src = path.join(IMAGES_DIR, entry);
        if (!fs.statSync(src).isFile()) continue;
        fs.copyFileSync(src, path.join(outDir, entry));
      }
    },
  };
}

const plugins = [react(), tailwindcss(), vitePluginStorageProxy(), vitePluginLocalImages()];

export default defineConfig({
  plugins,
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  envDir: path.resolve(import.meta.dirname),
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    port: 3000,
    strictPort: false, // Will find next available port if 3000 is busy
    host: true,
    allowedHosts: [
      ".manuspre.computer",
      ".manus.computer",
      ".manus-asia.computer",
      ".manuscomputer.ai",
      ".manusvm.computer",
      "localhost",
      "127.0.0.1",
    ],
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
