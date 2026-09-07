import { describe, expect, it } from "vitest";
import { cacheKey, extractTemplate } from "../src/extract.js";

const page = (body) => `<!doctype html><html><head><title>Hello</title></head><body>${body}</body></html>`;

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

describe("cacheKey", () => {
  const url = new URL("https://example.com/posts/1");

  it("is stable for the same inputs", async () => {
    expect(await cacheKey(url, "<b>Card</b>", "1")).toBe(await cacheKey(url, "<b>Card</b>", "1"));
    expect(await cacheKey(url, "<b>Card</b>", null)).toBe(await cacheKey(url, "<b>Card</b>", null));
  });

  it("changes with the template, the version, and the url", async () => {
    const base = await cacheKey(url, "<b>Card</b>", "1");
    expect(await cacheKey(url, "<b>Card 2</b>", "1")).not.toBe(base);
    expect(await cacheKey(url, "<b>Card</b>", "2")).not.toBe(base);
    expect(await cacheKey(new URL("https://example.com/posts/2"), "<b>Card</b>", "1")).not.toBe(base);
  });
});
