import puppeteer from "@cloudflare/puppeteer";
import { HEIGHT, WIDTH, swapToTemplate } from "./swap.js";

/** @typedef {(target: URL) => Promise<Uint8Array>} Renderer */

/**
 * @param {import("./index.js").Env} env
 * @returns {Renderer}
 */
export function createPuppeteerRenderer(env) {
  return async (target) => {
    const browser = await puppeteer.launch(env.BROWSER);
    try {
      const page = await browser.newPage();
      await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 });
      // Navigate to the real page (not the preview URL) so assets load same-origin and the
      // dev script, if present, stays inert. The swap happens here instead.
      await page.goto(target.toString(), { waitUntil: "load", timeout: 15_000 });
      await page.evaluate(swapToTemplate);
      // The swap waits for images and fonts from inside the page. Also wait for the network to
      // settle so anything else the template kicked off (CSS-referenced images, late font
      // requests) has landed before the screenshot.
      await page.waitForNetworkIdle({ idleTime: 250, timeout: 5000 }).catch(() => {});
      const png = await page.screenshot({
        type: "png",
        clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT },
      });
      return new Uint8Array(png);
    } finally {
      await browser.close();
    }
  };
}
