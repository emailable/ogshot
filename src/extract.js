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
