import { describe, expect, it } from "vitest";
import { contentKey, extractFallbackInputs, extractTemplate } from "../src/extract.js";

const page = (body, head = "") =>
  `<!doctype html><html><head><title>Hello</title>${head}</head><body>${body}</body></html>`;

describe("extractTemplate", () => {
  it("returns the template inner markup", () => {
    const html = page(`<p>x</p><template data-ogshot class="hidden"><div>Card</div></template>`);
    expect(extractTemplate(html)).toBe("<div>Card</div>");
  });

  it("returns null when there is no template", () => {
    expect(extractTemplate(page("<p>x</p>"))).toBeNull();
    expect(extractTemplate(page("<template><div>not og</div></template>"))).toBeNull();
  });
});

describe("extractFallbackInputs", () => {
  it("collects title, description and site name regardless of attribute order", () => {
    const html = page(
      "",
      `<meta content="Desc" name="description"><meta property="og:site_name" content="Site">`,
    );
    expect(extractFallbackInputs(html)).toBe("Hello\nDesc\nSite");
  });

  it("prefers og:description over description", () => {
    const html = page("", `<meta name="description" content="A"><meta property="og:description" content="B">`);
    expect(extractFallbackInputs(html)).toBe("Hello\nB\n");
  });
});

describe("contentKey", () => {
  const url = new URL("https://example.com/posts/1");

  it("ignores changes outside the template", async () => {
    const a = page(`<meta name="csrf-token" content="aaa"><template data-ogshot><b>Card</b></template>`);
    const b = page(`<meta name="csrf-token" content="bbb"><template data-ogshot><b>Card</b></template>`);
    expect(await contentKey(url, a)).toBe(await contentKey(url, b));
  });

  it("changes when the template changes", async () => {
    const a = page(`<template data-ogshot><b>Card</b></template>`);
    const b = page(`<template data-ogshot><b>Card 2</b></template>`);
    expect(await contentKey(url, a)).not.toBe(await contentKey(url, b));
  });

  it("changes with the page url", async () => {
    const html = page(`<template data-ogshot><b>Card</b></template>`);
    expect(await contentKey(url, html)).not.toBe(
      await contentKey(new URL("https://example.com/posts/2"), html),
    );
  });
});
