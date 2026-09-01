import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: process.env.AIRLOCK_BASE_PATH ?? "/",
  build: {
    outDir: "dist",
    sourcemap: true,
  },
});
