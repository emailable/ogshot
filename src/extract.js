const TEMPLATE_RE = /<template\b[^>]*\bdata-ogshot\b[^>]*>([\s\S]*?)<\/template>/i;

/**
 * Returns the inner markup of `<template data-ogshot>`, or null when the page has none.
 *
 * @param {string} html
 * @returns {string | null}
 */
export function extractTemplate(html) {
  return html.match(TEMPLATE_RE)?.[1] ?? null;
}

/**
 * Cache key: a hash of the page URL, the caller's `v`, and the template markup. Per-request
 * noise elsewhere in the page, like CSRF tokens, doesn't trigger re-renders; a template edit
 * or a new `v` does.
 *
 * @param {URL} url
 * @param {string} template
 * @param {string | null} version The `v` query parameter, if any.
 * @returns {Promise<string>}
 */
export async function cacheKey(url, template, version) {
  const data = new TextEncoder().encode(
    `${url.origin}${url.pathname}${url.search}\n${version ?? ""}\n${template}`,
  );
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
