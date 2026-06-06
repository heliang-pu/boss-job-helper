import { crx } from "@crxjs/vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig, type UserConfig } from "vite";
import manifest from "./manifest.config";

type ExtensionViteConfig = UserConfig & {
  test: {
    environment: "jsdom";
    globals: true;
  };
};

const config: ExtensionViteConfig = {
  plugins: [react(), crx({ manifest })],
  test: {
    environment: "jsdom",
    globals: true,
  },
};

export default defineConfig(config);
