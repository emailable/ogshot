import { PREVIEW_PARAM, swapToTemplate } from "./swap.js";

/**
 * The optional dev preview script. Include it on your pages in development and append
 * `?ogshot-preview` to any URL to see the OG template at 1200x630 in your browser.
 *
 * @returns {string}
 */
export function devScript() {
  return `// ogshot preview script. https://github.com/jclusso/ogshot
(() => {
  if (!new URLSearchParams(location.search).has(${JSON.stringify(PREVIEW_PARAM)})) return;
  const swap = ${swapToTemplate.toString()};
  const run = () => { swap(); };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run);
  } else {
    run();
  }
})();
`;
}
