import { clientScript } from "../dist/client/worker.js";
import { homePage } from "./home.js";
import { extractTemplate } from "./extract.js";
import { isAllowedHost } from "./hosts.js";
import { createPuppeteerRenderer } from "./render.js";
import { createTiming } from "./timing.js";

/**
 * @typedef {object} Env
 * @property {Fetcher} BROWSER Browser Rendering binding.
 * @property {string} ALLOWED_HOSTS Comma-separated hosts the Worker may render.
 */

/**
 * @typedef {object} HandlerOptions
 * @property {(env: Env) => import("./render.js").Renderer} renderer Injectable because Browser
 *   Rendering has no local emulation.
 */

const USER_AGENT = "ogshot/0.1 (+https://github.com/jclusso/ogshot)";
const CACHE_ORIGIN = "https://ogshot.cache";

/**
 * @param {HandlerOptions} options
 * @returns {ExportedHandler<Env>}
 */
export function createHandler({ renderer }) {
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
        case "/ogshot.js":
          return new Response(clientScript, {
            headers: {
              "content-type": "text/javascript; charset=utf-8",
              "cache-control": "public, max-age=86400, stale-while-revalidate=604800",
              "access-control-allow-origin": "*",
            },
          });
        case "/render.png": {
          const response = await render(url, env, ctx, renderer(env));
          // HEAD warms the cache without sending the body.
          return request.method === "HEAD" ? new Response(null, response) : response;
        }
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
 */
async function render(url, env, ctx, renderer) {
  const target = parseTarget(url.searchParams.get("url"));
  if (!target) return text("Missing or invalid url parameter", 400);
  if (!isAllowedHost(target.hostname, env.ALLOWED_HOSTS)) return text("Host not allowed", 403);

  // The key is the page URL and `v`, nothing else, so a hit costs one cache lookup and never
  // touches the origin. `v` is what changes when the image should; without it the entry expires
  // with its own Cache-Control after a day.
  const version = url.searchParams.get("v");
  const key = cacheKey(target, version);
  const cache = caches.default;

  const hit = await cache.match(key);
  if (hit) return withHeaders(hit, { "x-ogshot-cache": "HIT" });

  const timing = createTiming();
  const page = await timing.time("fetch", () => fetchPage(target));
  if (!page.ok) return text(`Upstream returned ${page.status}`, 502);

  // Redirects are followed; make sure we didn't land somewhere off the allowlist.
  const finalUrl = new URL(page.url || target.toString());
  if (!isAllowedHost(finalUrl.hostname, env.ALLOWED_HOSTS)) return text("Host not allowed", 403);

  const html = await page.text();
  if (extractTemplate(html) === null) return text("Page has no <template data-ogshot>", 422);

  const png = await renderer(finalUrl, html, timing);
  const response = new Response(png, {
    headers: {
      "content-type": "image/png",
      "cache-control":
        version !== null ? "public, max-age=31536000, immutable" : "public, max-age=86400",
    },
  });
  ctx.waitUntil(cache.put(key, response.clone()));

  return withHeaders(response, { "x-ogshot-cache": "MISS", "server-timing": timing.header() });
}

/**
 * @param {URL} target
 * @param {string | null} version The `v` query parameter, if any.
 * @returns {Request}
 */
function cacheKey(target, version) {
  const key = new URL(`${CACHE_ORIGIN}/render.png`);
  key.searchParams.set("url", target.toString());
  if (version !== null) key.searchParams.set("v", version);
  return new Request(key.toString());
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

/** @param {URL} target */
function fetchPage(target) {
  return fetch(target.toString(), {
    headers: { "user-agent": USER_AGENT, accept: "text/html" },
    redirect: "follow",
    cache: "no-store",
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
