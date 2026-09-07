import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, expect, it, vi } from "vitest";
import { createHandler } from "../src/index.js";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const env = { ALLOWED_HOSTS: "example.com,*.example.org", BROWSER: {} };

const html = (card) =>
  `<!doctype html><html><head><title>T</title></head><body><template data-ogshot>${card}</template></body></html>`;

function handler(upstream = {}) {
  const render = vi.fn(async () => PNG);
  const fetch = vi.fn(async (input) => {
    const key = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const respond = upstream[key];
    if (!respond) throw new Error(`Unexpected fetch: ${key}`);
    return respond();
  });

  const app = createHandler({ renderer: () => render, fetch });
  const call = async (path) => {
    const ctx = createExecutionContext();
    const response = await app.fetch(new Request(`https://ogshot.test${path}`), env, ctx);
    await waitOnExecutionContext(ctx);
    return response;
  };
  return { render, fetch, call };
}

const ok = (body, url) => () => {
  const response = new Response(body, { status: 200, headers: { "content-type": "text/html" } });
  return url ? Object.defineProperty(response, "url", { value: url }) : response;
};

describe("GET /render", () => {
  it("rejects a missing or non-http url", async () => {
    const { call } = handler();
    expect((await call("/render")).status).toBe(400);
    expect((await call("/render?url=ftp://example.com/x")).status).toBe(400);
    expect((await call("/render?url=not-a-url")).status).toBe(400);
  });

  it("rejects hosts outside ALLOWED_HOSTS before fetching anything", async () => {
    const { call, render, fetch } = handler();
    const response = await call("/render?url=https://evil.com/page");
    expect(response.status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
    expect(render).not.toHaveBeenCalled();
  });

  it("renders on a miss and serves the cache on a hit", async () => {
    const { call, render } = handler({ "https://example.com/posts/1": ok(html("<b>A</b>")) });

    const miss = await call("/render?url=https://example.com/posts/1&v=1");
    expect(miss.status).toBe(200);
    expect(miss.headers.get("content-type")).toBe("image/png");
    expect(miss.headers.get("x-ogshot-cache")).toBe("MISS");
    expect(miss.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(new Uint8Array(await miss.arrayBuffer())).toEqual(PNG);
    expect(render).toHaveBeenCalledTimes(1);
    expect(render.mock.calls[0][0].toString()).toBe("https://example.com/posts/1");

    const hit = await call("/render?url=https://example.com/posts/1&v=1");
    expect(hit.status).toBe(200);
    expect(hit.headers.get("x-ogshot-cache")).toBe("HIT");
    expect(new Uint8Array(await hit.arrayBuffer())).toEqual(PNG);
    expect(render).toHaveBeenCalledTimes(1);
  });

  it("re-renders when v changes and uses a shorter browser TTL without it", async () => {
    const { call, render } = handler({ "https://example.com/posts/2": ok(html("<b>B</b>")) });

    await call("/render?url=https://example.com/posts/2&v=1");
    await call("/render?url=https://example.com/posts/2&v=2");
    expect(render).toHaveBeenCalledTimes(2);

    const unversioned = await call("/render?url=https://example.com/posts/2");
    expect(unversioned.headers.get("x-ogshot-cache")).toBe("MISS");
    expect(unversioned.headers.get("cache-control")).toBe("public, max-age=86400");
    expect(render).toHaveBeenCalledTimes(3);
  });

  it("re-renders when the template changes", async () => {
    let version = 1;
    const { call, render } = handler({
      "https://a.example.org/p": () => ok(html(`<b>v${version++}</b>`))(),
    });

    await call("/render?url=https://a.example.org/p");
    await call("/render?url=https://a.example.org/p");
    expect(render).toHaveBeenCalledTimes(2);
  });

  it("allows wildcard subdomains", async () => {
    const { call } = handler({ "https://blog.example.org/": ok(html("<b>w</b>")) });
    expect((await call("/render?url=https://blog.example.org/")).status).toBe(200);
  });

  it("refuses redirects that leave the allowlist", async () => {
    const { call, render } = handler({
      "https://example.com/out": ok(html("<b>x</b>"), "https://evil.com/landing"),
    });
    expect((await call("/render?url=https://example.com/out")).status).toBe(403);
    expect(render).not.toHaveBeenCalled();
  });

  it("returns 502 when the page cannot be fetched", async () => {
    const { call } = handler({ "https://example.com/missing": () => new Response("nope", { status: 404 }) });
    expect((await call("/render?url=https://example.com/missing")).status).toBe(502);
  });
});

describe("GET /preview.js", () => {
  it("serves a self-contained script gated on the preview param", async () => {
    const { call } = handler();
    const response = await call("/preview.js");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("javascript");
    const body = await response.text();
    expect(body).toContain('"ogshot-preview"');
    expect(body).toContain("template[data-ogshot]");
    expect(body).not.toContain("__name(");
  });
});

describe("other routes", () => {
  it("serves the home page at / and 404s elsewhere", async () => {
    const { call } = handler();
    const home = await call("/");
    expect(home.status).toBe(200);
    expect(home.headers.get("content-type")).toContain("text/html");
    const body = await home.text();
    expect(body).toContain("ogshot");
    expect(body).toContain("*.example.org");
    // Examples use the deployment's own origin and first allowed host.
    expect(body).toContain("https://ogshot.test/render?url=https%3A%2F%2Fexample.com%2Fposts%2F1");
    expect((await call("/nope")).status).toBe(404);
  });
});
