import { defineConfig } from "vite";

export default defineConfig({
  // Relative base so the build works from any path — GitHub Pages project
  // sites live under /<repo>/, local `vite preview` lives at /.
  base: "./",
  build: { target: "es2022" },
  worker: { format: "es" },
});
