export const PREVIEW_PARAM = "ogshot-preview";
export const WIDTH = 1200;
export const HEIGHT = 630;

/**
 * Replaces the page body with the OG template at 1200x630. Runs in the browser via the
 * client script and in headless Chromium at render time.
 *
 * Serialized with Function.prototype.toString for the renderer, so it must be fully
 * self-contained: no imports, no references to module scope.
 */
export function swapToTemplate() {
  const doc = document;
  if (doc.getElementById("ogshot")) return;

  const template = doc.querySelector("template[data-ogshot]");
  if (!template) return;

  doc.body.innerHTML =
    '<div id="ogshot" style="position:relative;width:1200px;height:630px;overflow:hidden;">' +
    template.innerHTML +
    "</div>";
  doc.body.removeAttribute("class");
  doc.body.setAttribute(
    "style",
    "margin:0;padding:0;width:1200px;height:630px;overflow:hidden;background:#fff;",
  );
  doc.documentElement.style.cssText += ";margin:0;padding:0;width:1200px;height:630px;overflow:hidden;";
}

/**
 * Waits until everything the swapped-in template needs has loaded, so the renderer knows
 * when to screenshot. Only the renderer runs this; a browser preview just paints as
 * resources arrive. Same serialization constraints as swapToTemplate.
 *
 * @returns {Promise<void>}
 */
export async function settleTemplate() {
  const doc = document;
  const root = doc.getElementById("ogshot");
  if (!root) return;

  // Everything below resolves as soon as the resource is ready; the timeouts only matter when
  // a request hangs.
  const settle = (promise, ms) =>
    Promise.race([promise, new Promise((resolve) => setTimeout(resolve, ms))]);
  const onceLoaded = (el) =>
    new Promise((resolve) => {
      el.addEventListener("load", () => resolve(), { once: true });
      el.addEventListener("error", () => resolve(), { once: true });
    });

  // Stylesheets. The page was navigated with domcontentloaded, so some may still be in flight.
  const sheets = Array.from(doc.querySelectorAll('link[rel="stylesheet"]'));
  await settle(Promise.all(sheets.map((link) => (link.sheet ? Promise.resolve() : onceLoaded(link)))), 5000);

  await new Promise((resolve) => requestAnimationFrame(resolve));

  // <img> elements and CSS background images inside the template.
  const images = Array.from(root.querySelectorAll("img"));
  const backgroundUrls = new Set();
  for (const el of root.querySelectorAll("*")) {
    const bg = getComputedStyle(el).backgroundImage;
    for (const match of bg.matchAll(/url\(["']?([^"')]+)["']?\)/g)) backgroundUrls.add(match[1]);
  }
  await settle(
    Promise.all([
      ...images.map((img) => (img.complete ? Promise.resolve() : onceLoaded(img))),
      ...Array.from(backgroundUrls, (src) => {
        const img = new Image();
        const loaded = onceLoaded(img);
        img.src = src;
        return loaded;
      }),
    ]),
    5000,
  );

  // Fonts the new layout asked for.
  await settle(doc.fonts ? doc.fonts.ready : Promise.resolve(), 5000);

  window.__ogshotReady = true;
}
