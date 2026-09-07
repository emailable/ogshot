export const PREVIEW_PARAM = "ogshot-preview";
export const WIDTH = 1200;
export const HEIGHT = 630;

/**
 * Runs inside the page, both in headless Chromium at render time and in the browser via
 * the dev preview script. It is serialized with Function.prototype.toString, so it must be
 * fully self-contained: no imports, no references to module scope.
 *
 * @returns {Promise<void>}
 */
export async function swapToTemplate() {
  const doc = document;
  if (doc.getElementById("ogshot")) return;

  const template = doc.querySelector("template[data-ogshot]");
  let markup;

  if (template) {
    markup = template.innerHTML;
  } else {
    const meta = (selector) => doc.querySelector(selector)?.content?.trim() ?? "";
    const escape = (s) =>
      s.replace(/[&<>"]/g, (c) => {
        if (c === "&") return "&amp;";
        if (c === "<") return "&lt;";
        if (c === ">") return "&gt;";
        return "&quot;";
      });

    const title = escape(doc.title.trim() || location.hostname);
    const description = escape(meta('meta[property="og:description"]') || meta('meta[name="description"]'));
    const site = escape(meta('meta[property="og:site_name"]') || location.hostname);

    markup =
      '<div style="box-sizing:border-box;width:1200px;height:630px;padding:80px;display:flex;flex-direction:column;justify-content:space-between;background:#0f172a;color:#f8fafc;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;">' +
      '<div style="font-size:64px;font-weight:700;line-height:1.1;letter-spacing:-0.02em;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;">' +
      title +
      "</div>" +
      '<div style="display:flex;flex-direction:column;gap:24px;">' +
      (description
        ? '<div style="font-size:30px;line-height:1.35;color:#cbd5e1;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">' +
          description +
          "</div>"
        : "") +
      '<div style="font-size:26px;color:#94a3b8;">' +
      site +
      "</div></div></div>";
  }

  doc.body.innerHTML =
    '<div id="ogshot" style="position:relative;width:1200px;height:630px;overflow:hidden;">' +
    markup +
    "</div>";
  doc.body.removeAttribute("class");
  doc.body.setAttribute(
    "style",
    "margin:0;padding:0;width:1200px;height:630px;overflow:hidden;background:#fff;",
  );
  doc.documentElement.style.cssText += ";margin:0;padding:0;width:1200px;height:630px;overflow:hidden;";

  await new Promise((resolve) => requestAnimationFrame(resolve));

  const images = Array.from(doc.querySelectorAll("img"));
  await Promise.all(
    images.map((img) =>
      img.complete
        ? Promise.resolve()
        : new Promise((resolve) => {
            img.addEventListener("load", () => resolve(), { once: true });
            img.addEventListener("error", () => resolve(), { once: true });
          }),
    ),
  );

  // fonts.ready resolves as soon as every font the layout asked for has loaded. The timer only
  // matters when a font request hangs, so it can be generous.
  await Promise.race([
    doc.fonts ? doc.fonts.ready : Promise.resolve(),
    new Promise((resolve) => setTimeout(resolve, 5000)),
  ]);

  window.__ogshotReady = true;
}
