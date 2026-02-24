import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "fs";
import { join } from "path";

const version = readFileSync(join(__dirname, "../VERSION"), "utf-8").trim();

export default defineConfig({
  plugins: [react()],
  root: "dashboard",
  base: "/dashboard/",
  define: {
    VERSION: JSON.stringify(version),
  },
  build: {
    outDir: "../dist/dashboard",
    emptyOutDir: true
  }
})