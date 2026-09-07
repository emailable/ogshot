import { PREVIEW_PARAM, swapToTemplate } from "./swap.js";

/**
 * The client, published to npm as `ogshot` and served by the Worker at /ogshot.js as an
 * IIFE. Two jobs:
 *
 * - With `?ogshot-preview` in the URL, swap the body for the OG template at 1200x630 so you
 *   can work on it in the browser. Same swap the renderer runs.
 * - Otherwise, find the page's og:image tag pointing at an ogshot Worker and send it a HEAD
 *   request, once per session. Whoever shares a link usually loaded the page first, so this
 *   has the image rendered and cached before any crawler asks for it.
 *
 * The warm-up must not affect page load: it runs after the window load event, in an idle
 * callback, as a low-priority request whose response has no body.
 */
export function ogshot() {
  if (new URLSearchParams(location.search).has(PREVIEW_PARAM)) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", swapToTemplate);
    } else {
      swapToTemplate();
    }
    return;
  }

  const warm = () => {
    const meta = document.querySelector('meta[property="og:image"]');
    const image = meta && meta.content;
    if (!image) return;
    let url;
    try {
      url = new URL(image, location.href);
    } catch {
      return;
    }
    if (url.pathname !== "/render.png" || !url.searchParams.has("url")) return;
    const key = "ogshot:" + url.href;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {}
    fetch(url.href, { method: "HEAD", mode: "no-cors", priority: "low", keepalive: true }).catch(() => {});
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
}
