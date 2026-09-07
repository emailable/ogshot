import { devScript } from "./devScript.js";
import { homePage } from "./home.js";
import { contentKey } from "./extract.js";
import { isAllowedHost } from "./hosts.js";
import { createPuppeteerRenderer } from "./render.js";

/**
 * @typedef {object} Env
 * @property {Fetcher} BROWSER Browser Rendering binding.
 * @property {string} ALLOWED_HOSTS Comma-separated hosts the Worker may render.
 */

/**
 * @typedef {object} HandlerOptions
 * @property {(env: Env) => import("./render.js").Renderer} renderer
 * @property {typeof globalThis.fetch} [fetch] Used to fetch the target page. Injectable for tests.
 */

const USER_AGENT = "ogshot/0.1 (+https://github.com/jclusso/ogshot)";
const CACHE_ORIGIN = "https://ogshot.cache";

/**
 * @param {HandlerOptions} options
 * @returns {ExportedHandler<Env>}
 */
export function createHandler({ renderer, fetch: fetchImpl = (...args) => globalThis.fetch(...args) }) {
  return {
    async fetch(request, env, ctx) {
      const url = new URL(request.url);

      if (request.method !== "GET" && request.method !== "HEAD") {
        return text("Method not allowed", 405);
      }

      switch (url.pathname) {
        case "/":
          return new Response(
            homePage({ mode: "worker", origin: url.origin, allowedHosts: env.ALLOWED_HOSTS }),
            {
              headers: { "content-type": "text/html; charset=utf-8" },
            },
          );
        case "/preview.js":
          return new Response(devScript(), {
            headers: {
              "content-type": "text/javascript; charset=utf-8",
              "cache-control": "public, max-age=3600",
            },
          });
        case "/render":
          return render(url, env, ctx, renderer(env), fetchImpl);
        default:
          return text("Not found", 404);
      }
    },
  };
}

/**
 * @param {URL} url
 * @param {Env} env
 * @param {ExecutionContext} ctx
 * @param {import("./render.js").Renderer} renderer
 * @param {typeof globalThis.fetch} fetchImpl
 */
async function render(url, env, ctx, renderer, fetchImpl) {
  const target = parseTarget(url.searchParams.get("url"));
  if (!target) return text("Missing or invalid url parameter", 400);
  if (!isAllowedHost(target.hostname, env.ALLOWED_HOSTS)) return text("Host not allowed", 403);

  const page = await fetchPage(target, fetchImpl);
  if (!page.ok) return text(`Upstream returned ${page.status}`, 502);

  // Redirects are followed; make sure we didn't land somewhere off the allowlist.
  const finalUrl = new URL(page.url || target.toString());
  if (!isAllowedHost(finalUrl.hostname, env.ALLOWED_HOSTS)) return text("Host not allowed", 403);

  const key = await contentKey(finalUrl, await page.text());
  const cacheKey = new Request(`${CACHE_ORIGIN}/${key}.png`);
  const cache = caches.default;

  const versioned = url.searchParams.has("v");
  const browserCache = versioned ? "public, max-age=31536000, immutable" : "public, max-age=86400";

  const hit = await cache.match(cacheKey);
  if (hit) return withHeaders(hit, { "cache-control": browserCache, "x-ogshot-cache": "HIT" });

  const png = await renderer(finalUrl);
  const stored = new Response(png, {
    headers: {
      "content-type": "image/png",
      "content-length": String(png.byteLength),
      // Edge TTL. The key is content-addressed, so this can be long regardless of `v`.
      "cache-control": "public, max-age=31536000",
      "x-ogshot-key": key,
    },
  });
  ctx.waitUntil(cache.put(cacheKey, stored.clone()));

  return withHeaders(stored, { "cache-control": browserCache, "x-ogshot-cache": "MISS" });
}

/**
 * @param {string | null} raw
 * @returns {URL | null}
 */
function parseTarget(raw) {
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    parsed.hash = "";
    return parsed;
  } catch {
    return null;
  }
}

/**
 * @param {URL} target
 * @param {typeof globalThis.fetch} fetchImpl
 */
function fetchPage(target, fetchImpl) {
  return fetchImpl(target.toString(), {
    headers: { "user-agent": USER_AGENT, accept: "text/html" },
    redirect: "follow",
    signal: AbortSignal.timeout(10_000),
  });
}

/**
 * @param {Response} response
 * @param {Record<string, string>} headers
 */
function withHeaders(response, headers) {
  const out = new Response(response.body, response);
  for (const [name, value] of Object.entries(headers)) out.headers.set(name, value);
  return out;
}

/**
 * @param {string} body
 * @param {number} [status]
 */
function text(body, status = 200) {
  return new Response(body, { status, headers: { "content-type": "text/plain; charset=utf-8" } });
}

export default createHandler({ renderer: createPuppeteerRenderer });
