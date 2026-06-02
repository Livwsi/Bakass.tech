import { defineConfig } from "astro/config";
import react from "@astrojs/react";

// https://astro.build/config
export default defineConfig({
  site: "https://bakass.tech",
  integrations: [react()],
  output: "static",
  build: { inlineStylesheets: "auto" },
});
