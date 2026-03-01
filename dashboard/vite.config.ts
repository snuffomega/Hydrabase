import react from "@vitejs/plugin-react";
import { readFileSync } from "fs";
import { join } from "path";
import { defineConfig } from "vite";

const version = readFileSync(join(__dirname, "../VERSION"), "utf-8").trim();

export default defineConfig({
  base: "/dashboard/",
  build: {
    emptyOutDir: true,
    outDir: "../dist/dashboard"
  },
  define: {
    VERSION: JSON.stringify(version),
  },
  plugins: [react()],
  root: "dashboard"
})