import { describe, expect, it } from "vitest";
import { extractTemplate } from "../src/extract.js";

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
