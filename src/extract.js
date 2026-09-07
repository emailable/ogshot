const TEMPLATE_RE = /<template\b[^>]*\bdata-ogshot\b[^>]*>([\s\S]*?)<\/template>/i;
const TITLE_RE = /<title\b[^>]*>([\s\S]*?)<\/title>/i;

/**
 * @param {string} html
 * @param {"name" | "property"} attr
 * @param {string} value
 * @returns {string | null}
 */
function metaContent(html, attr, value) {
  // Attribute order varies, so match the tag and then pull content out of it.
  const tagRe = new RegExp(`<meta\\b[^>]*\\b${attr}=["']${value}["'][^>]*>`, "i");
  const tag = html.match(tagRe)?.[0];
  if (!tag) return null;
  return tag.match(/\bcontent=["']([^"']*)["']/i)?.[1] ?? null;
}

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
 * The inputs the in-page fallback card is built from. Used only for cache keying,
 * so it has to change whenever the fallback card would.
 *
 * @param {string} html
 * @returns {string}
 */
export function extractFallbackInputs(html) {
  const title = html.match(TITLE_RE)?.[1]?.trim() ?? "";
  const description =
    metaContent(html, "property", "og:description") ?? metaContent(html, "name", "description") ?? "";
  const site = metaContent(html, "property", "og:site_name") ?? "";
  return [title, description, site].join("\n");
}

/**
 * Cache key. Hashes the page URL, the caller's `v`, and the parts of the page that affect
 * the image. Per-request noise like CSRF tokens doesn't trigger re-renders; a template edit
 * or a new `v` does.
 *
 * @param {URL} url
 * @param {string} html
 * @param {string | null} version The `v` query parameter, if any.
 * @returns {Promise<string>}
 */
export async function contentKey(url, html, version) {
  const content = extractTemplate(html) ?? extractFallbackInputs(html);
  const data = new TextEncoder().encode(
    `${url.origin}${url.pathname}${url.search}\n${version ?? ""}\n${content}`,
  );
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
