import { PREVIEW_PARAM, swapToTemplate } from "./swap.js";

/**
 * The optional client script, served at /ogshot.js. Two jobs:
 *
 * - With `?ogshot-preview` in the URL, swap the body for the OG template at 1200x630 so you
 *   can work on it in the browser. Same code the renderer runs.
 * - Otherwise, find the page's og:image tag pointing at this Worker and send it a HEAD
 *   request, once per session. Whoever shares a link usually loaded the page first, so this
 *   has the image rendered and cached before any crawler asks for it.
 *
 * The warm-up must not affect page load: it runs after the window load event, in an idle
 * callback, as a low-priority request whose response has no body.
 *
 * @returns {string}
 */
export function clientScript() {
  return `// ogshot client script. https://github.com/jclusso/ogshot
(() => {
  if (new URLSearchParams(location.search).has(${JSON.stringify(PREVIEW_PARAM)})) {
    const swap = ${swapToTemplate.toString()};
    const run = () => { swap(); };
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", run);
    } else {
      run();
    }
    return;
  }

  const origin = new URL(document.currentScript.src).origin;
  const warm = () => {
    const meta = document.querySelector('meta[property="og:image"]');
    const image = meta && meta.content;
    if (!image || !image.startsWith(origin + "/")) return;
    const key = "ogshot:" + image;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {}
    fetch(image, { method: "HEAD", mode: "no-cors", priority: "low", keepalive: true }).catch(() => {});
  };
  const whenIdle = () => {
    if ("requestIdleCallback" in window) {
      requestIdleCallback(warm, { timeout: 5000 });
    } else {
      setTimeout(warm, 1000);
    }
  };
  if (document.readyState === "complete") {
    whenIdle();
  } else {
    addEventListener("load", whenIdle, { once: true });
  }
})();
`;
}
