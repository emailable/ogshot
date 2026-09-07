const REPO = "https://github.com/jclusso/ogshot";
const DEPLOY_URL = `https://deploy.workers.cloudflare.com/?url=${REPO}`;

// A 1200x630 card with a title line and a shutter dot, on the same slate as the page.
const FAVICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#0f172a"/><rect x="5" y="9" width="22" height="14" rx="2.5" fill="none" stroke="#f8fafc" stroke-width="2.5"/><path d="M9.5 14h7" stroke="#f8fafc" stroke-width="2.5" stroke-linecap="round"/><circle cx="21.5" cy="18" r="2.25" fill="#f8fafc"/></svg>`;

/**
 * The home page. Served by the Worker at `/` and built statically for GitHub Pages.
 *
 * In worker mode the examples use the deployment's own origin and first allowed host, and a
 * form lets you try a render. In static mode there's no Worker behind the page, so that
 * section becomes a Deploy to Cloudflare call to action.
 *
 * @param {{ mode: "worker" | "static", origin?: string, allowedHosts?: string }} options
 * @returns {string}
 */
export function homePage({ mode, origin = "https://ogshot.example.com", allowedHosts = "" }) {
  const hosts = allowedHosts
    .split(",")
    .map((h) => h.trim())
    .filter(Boolean);
  const exampleHost = exampleHostFor(hosts);
  const examplePage = `https://${exampleHost}/posts/1`;

  const primary = mode === "worker" ? tryIt(hosts, examplePage) : deployIt();
  const imageUrl = `${origin}/render.png?url=${encodeURIComponent(examplePage)}&v=1725000000`;
  const example = `<template data-ogshot>
  <div class="flex h-full w-full flex-col justify-between bg-neutral-900 p-20 text-white">
    <h1 class="text-6xl font-bold">How we cut build times in half</h1>
    <p class="text-2xl text-neutral-400">${exampleHost}</p>
  </div>
</template>

<meta property="og:image" content="${imageUrl}">
<meta property="og:image:type" content="image/png">
<script src="${origin}/ogshot.js" async fetchpriority="low"></script>`;

  return `<!doctype html>
<html lang="en" class="h-full dark">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>ogshot</title>
  <meta name="description" content="Open Graph images from your own HTML and CSS, rendered and cached on Cloudflare Workers.">
  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,${encodeURIComponent(FAVICON)}">
  <script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>
</head>
<body class="min-h-full bg-black text-neutral-100 antialiased">
  <main class="mx-auto max-w-2xl px-6 py-16">
    <header class="flex items-start justify-between gap-6">
      <div>
        <h1 class="text-3xl font-semibold tracking-tight">ogshot</h1>
        <p class="mt-3 text-lg text-neutral-400">Open Graph images from your own HTML and CSS, rendered and cached on Cloudflare Workers.</p>
      </div>
      <a href="${REPO}"
        class="inline-flex shrink-0 items-center gap-2 rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm font-medium text-neutral-200 hover:bg-neutral-800">
        ${GITHUB_ICON}
        GitHub
      </a>
    </header>

    ${primary}

    <section class="mt-10">
      <h2 class="text-sm font-semibold uppercase tracking-wide text-neutral-500">Endpoints</h2>
      <dl class="mt-3 divide-y divide-neutral-800 rounded-md border border-neutral-800 bg-neutral-900 text-sm">
        <div class="px-4 py-3">
          <dt class="break-all font-mono">GET ${escape(origin)}/render.png?url=${escape(encodeURIComponent(examplePage))}&amp;v=1725000000</dt>
          <dd class="mt-1 text-neutral-400">The PNG. The page must be on an allowed host and contain a <code>&lt;template data-ogshot&gt;</code>. Change <code>v</code> whenever the card content changes so crawlers refetch.</dd>
        </div>
        <div class="px-4 py-3">
          <dt class="break-all font-mono">GET ${escape(origin)}/ogshot.js</dt>
          <dd class="mt-1 text-neutral-400">Optional client script. Warms the cache for the page's <code>og:image</code> when someone visits, and with <code>?ogshot-preview</code> in the URL shows the template at 1200x630.</dd>
        </div>
      </dl>
    </section>

    <section class="mt-10">
      <h2 class="text-sm font-semibold uppercase tracking-wide text-neutral-500">Use it</h2>
      <pre class="mt-3 overflow-x-auto rounded-md border border-neutral-800 bg-neutral-900 px-4 py-3 text-xs leading-relaxed text-neutral-300"><code>${highlightHtml(example)}</code></pre>
    </section>

  </main>
</body>
</html>
`;
}

/**
 * @param {string[]} hosts
 * @param {string} examplePage
 */
function tryIt(hosts, examplePage) {
  const hostList = hosts.length
    ? hosts.map((h) => `<code class="rounded bg-neutral-800 px-1.5 py-0.5 text-neutral-200">${escape(h)}</code>`).join(" ")
    : '<span class="text-amber-400">none configured, every request will 403</span>';

  return `<section class="mt-10">
      <h2 class="text-sm font-semibold uppercase tracking-wide text-neutral-500">Try it</h2>
      <form id="try" class="mt-3 flex flex-col gap-3 sm:flex-row">
        <input name="url" type="url" required placeholder="${escape(examplePage)}"
          class="flex-1 rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-400">
        <input name="v" type="text" placeholder="v" title="Optional version. A new value forces a fresh render."
          class="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-400 sm:w-28">
        <button type="submit"
          class="rounded-md bg-white px-4 py-2 text-sm font-medium text-neutral-900 hover:bg-neutral-200">Render</button>
      </form>
      <p class="mt-2 text-sm text-neutral-400">Allowed hosts: ${hostList}. Leave <code>v</code> empty to see cache hits; change it to force a render.</p>
      <div id="result" class="mt-4 hidden">
        <div id="frame" class="relative aspect-[1200/630] w-full overflow-hidden rounded-md border border-neutral-800 bg-neutral-900">
          <div id="loading" class="absolute inset-0 flex items-center justify-center gap-3 text-sm text-neutral-400">
            <svg class="size-5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v3a5 5 0 0 0-5 5H4z"/></svg>
            Rendering, the first one takes a few seconds
          </div>
          <div id="error" class="absolute inset-0 hidden flex-col items-center justify-center gap-1 px-6 text-center">
            <p class="text-sm font-medium text-red-400">Render failed</p>
            <p id="error-message" class="break-all font-mono text-xs text-neutral-400"></p>
          </div>
          <img id="preview" alt="Rendered Open Graph image" class="hidden h-full w-full">
        </div>
        <p id="status" class="mt-2 break-all font-mono text-xs text-neutral-500"></p>
      </div>
    </section>

    <script>
    const form = document.getElementById("try");
    const result = document.getElementById("result");
    const loading = document.getElementById("loading");
    const error = document.getElementById("error");
    const errorMessage = document.getElementById("error-message");
    const preview = document.getElementById("preview");
    const status = document.getElementById("status");

    const show = (state) => {
      loading.classList.toggle("hidden", state !== "loading");
      error.classList.toggle("hidden", state !== "error");
      error.classList.toggle("flex", state === "error");
      preview.classList.toggle("hidden", state !== "image");
    };

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const url = new URL("/render.png", location.origin);
      url.searchParams.set("url", form.elements.url.value);
      if (form.elements.v.value) url.searchParams.set("v", form.elements.v.value);

      result.classList.remove("hidden");
      show("loading");
      status.textContent = url;

      const started = performance.now();
      let response;
      try {
        response = await fetch(url);
      } catch (e) {
        errorMessage.textContent = "Network error: " + e.message;
        show("error");
        return;
      }
      const ms = Math.round(performance.now() - started);

      if (!response.ok) {
        errorMessage.textContent = response.status + " " + (await response.text());
        show("error");
        return;
      }

      const blob = await response.blob();
      await new Promise((resolve) => {
        preview.onload = preview.onerror = resolve;
        preview.src = URL.createObjectURL(blob);
      });
      show("image");
      const timing = response.headers.get("server-timing");
      status.textContent = response.headers.get("x-ogshot-cache") + " in " + ms + "ms" + (timing ? " (" + timing + ")" : "") + ". " + url;
    });
    </script>`;
}

function deployIt() {
  return `<section class="mt-10 rounded-md border border-neutral-800 bg-neutral-900 px-4 py-4">
      <h2 class="text-sm font-semibold uppercase tracking-wide text-neutral-500">Deploy it</h2>
      <p class="mt-2 text-sm text-neutral-400">One click creates a copy in your GitHub account and deploys it to your Cloudflare account. Set <code>ALLOWED_HOSTS</code> to your domains and you're done.</p>
      <a href="${DEPLOY_URL}" class="mt-4 inline-block">
        <img src="https://deploy.workers.cloudflare.com/button" alt="Deploy to Cloudflare">
      </a>
    </section>`;
}

/**
 * Picks a concrete host for examples. Prefers an exact host; turns "*.example.com" into
 * "www.example.com"; falls back to example.com.
 *
 * @param {string[]} hosts
 */
function exampleHostFor(hosts) {
  const exact = hosts.find((h) => !h.startsWith("*."));
  if (exact) return exact;
  const wildcard = hosts.find((h) => h.startsWith("*."));
  if (wildcard) return `www${wildcard.slice(1)}`;
  return "example.com";
}

const GITHUB_ICON = `<svg aria-hidden="true" viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8Z"/></svg>`;

/**
 * Minimal HTML syntax coloring for the example. Tags, attribute names, and attribute values
 * get their own color; everything else stays the default.
 *
 * @param {string} source
 */
function highlightHtml(source) {
  const span = (cls, text) => `<span class="${cls}">${escape(text)}</span>`;
  return source.replace(/<(\/?)([\w-]+)((?:\s+[\w:@.-]+(?:="[^"]*")?)*)\s*(\/?)>|[^<]+/g, (m, slash, name, attrs, selfClose) => {
    if (name === undefined) return escape(m);
    const attributes = (attrs ?? "").replace(/\s+([\w:@.-]+)(?:="([^"]*)")?/g, (_, key, value) =>
      " " + span("text-sky-300", key) + (value === undefined ? "" : span("text-neutral-500", "=") + span("text-amber-300", `"${value}"`)),
    );
    return span("text-neutral-500", "<" + slash) + span("text-emerald-400", name) + attributes + span("text-neutral-500", selfClose + ">");
  });
}

/** @param {string} s */
function escape(s) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}
