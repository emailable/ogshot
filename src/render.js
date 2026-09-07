import puppeteer from "@cloudflare/puppeteer";
import { optimizePng } from "./png.js";
import { HEIGHT, WIDTH, settleTemplate, swapToTemplate } from "./swap.js";

/**
 * @typedef {(target: URL, html: string, timing: import("./timing.js").Timing) => Promise<Uint8Array>} Renderer
 */

// Keep the browser around between renders. Reconnecting is much faster than launching.
const KEEP_ALIVE_MS = 5 * 60_000;

// Resource types the template can't use.
const BLOCKED_TYPES = new Set(["media", "websocket", "eventsource", "manifest", "texttrack", "ping"]);

/**
 * @param {import("./index.js").Env} env
 * @returns {Renderer}
 */
export function createPuppeteerRenderer(env) {
  return async (target, html, timing) => {
    const browser = await timing.time("browser", () => connectOrLaunch(env));
    const context = await browser.createBrowserContext();
    try {
      const page = await context.newPage();
      await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 });

      // Answer the navigation with the HTML we already fetched (so the page isn't downloaded
      // twice, and the origin stays correct for fonts and relative URLs), and drop requests
      // that can't affect the image: third-party scripts, iframes, media.
      let served = false;
      await page.setRequestInterception(true);
      page.on("request", (request) => {
        const isMainFrame = request.frame() === page.mainFrame();
        let action;
        if (!served && isMainFrame && request.isNavigationRequest()) {
          served = true;
          action = request.respond({ status: 200, contentType: "text/html; charset=utf-8", body: html });
        } else if (shouldBlock(request, target, isMainFrame)) {
          action = request.abort("blockedbyclient");
        } else {
          action = request.continue();
        }
        // A request can be gone by the time we answer it. Nothing to do about that.
        action.catch(() => {});
      });

      await timing.time("load", () =>
        page.goto(target.toString(), { waitUntil: "domcontentloaded", timeout: 15_000 }),
      );
      await timing.time("swap", async () => {
        await page.evaluate(swapToTemplate);
        await page.evaluate(settleTemplate);
      });
      const png = await timing.time("screenshot", () =>
        page.screenshot({ type: "png", clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT } }),
      );
      // Chromium's encoder favors speed. Re-encoding losslessly is typically 30 to 40 percent
      // smaller, which keeps gradient-heavy cards under the stricter providers' size limits.
      return timing.time("optimize", async () => optimizePng(new Uint8Array(png)));
    } finally {
      await context.close().catch(() => {});
      browser.disconnect();
    }
  };
}

/** @param {import("./index.js").Env} env */
async function connectOrLaunch(env) {
  const sessions = await puppeteer.sessions(env.BROWSER).catch(() => []);
  for (const session of sessions) {
    if (session.connectionId) continue; // another request is using it
    try {
      return await puppeteer.connect(env.BROWSER, session.sessionId);
    } catch {
      // Session went away between listing and connecting. Try the next one.
    }
  }
  return puppeteer.launch(env.BROWSER, { keep_alive: KEEP_ALIVE_MS });
}

/**
 * @param {import("@cloudflare/puppeteer").HTTPRequest} request
 * @param {URL} target
 * @param {boolean} isMainFrame
 */
function shouldBlock(request, target, isMainFrame) {
  const type = request.resourceType();
  if (BLOCKED_TYPES.has(type)) return true;
  if (type === "document" && !isMainFrame) return true; // iframes: widgets, captchas, embeds
  if (type === "script") return !sameSite(new URL(request.url()).hostname, target.hostname);
  return false;
}

/**
 * True when both hosts share a registrable domain, approximated as the last two labels.
 * Lenient on purpose: this only decides which scripts to block.
 *
 * @param {string} a
 * @param {string} b
 */
export function sameSite(a, b) {
  const site = (host) => host.toLowerCase().split(".").slice(-2).join(".");
  return site(a) === site(b);
}
