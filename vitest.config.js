import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      // Browser Rendering has no local emulation and tests inject a fake renderer,
      // so don't let the `remote: true` binding open a session against Cloudflare.
      remoteBindings: false,
    }),
  ],
});
