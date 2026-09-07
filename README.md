# ogshot

Open Graph images from your own HTML and CSS, rendered and cached on Cloudflare Workers.

Put a `<template data-ogshot>` on any page. ogshot loads the page in headless Chromium, swaps the body for your template at 1200x630, screenshots it, and caches the PNG at the edge. Your existing styles, fonts, and templating language all work because it's just your page.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/jclusso/ogshot)

## How it works

1. A crawler requests `https://ogshot.example.com/render.png?url=https://example.com/posts/1&v=1725000000`.
2. The Worker fetches the page HTML, pulls out the template, and hashes it. That hash is the cache key.
3. On a miss, it opens the page in [Browser Rendering](https://developers.cloudflare.com/browser-rendering/), replaces the body with the template, waits for images and fonts, and screenshots.
4. The PNG is stored in the Workers Cache API and served with long cache headers.

## Deploy

Click the button above, or:

```sh
git clone https://github.com/jclusso/ogshot
cd ogshot
npm install
npx wrangler deploy
```

Then set `ALLOWED_HOSTS` to the hosts you want to render. It's a secret, not a variable, so a deploy can never overwrite it. The Deploy button asks for it. Otherwise, in the dashboard under Settings, Variables and Secrets, add a secret named `ALLOWED_HOSTS`, or from the CLI:

```sh
npx wrangler secret put ALLOWED_HOSTS
# example.com,*.example.com
```

Exact hosts match exactly. `*.example.com` matches any subdomain but not the apex. Anything else gets a 403, so nobody can spend your browser quota screenshotting other sites.

Browser Rendering is included on the Workers Free plan with a daily time limit, and billed by browser time on the Paid plan. A cached OG image costs nothing to serve, so most sites stay well inside the free allotment.

## Use it

### 1. Add a template to your page

```html
<template data-ogshot>
  <div class="flex h-full w-full flex-col justify-between bg-slate-900 p-20 text-white">
    <h1 class="text-6xl font-bold leading-tight">How we cut build times in half</h1>
    <p class="text-2xl text-slate-400">example.com</p>
  </div>
</template>
```

Generate the contents with whatever renders the rest of your page. The template is rendered inside a 1200x630 wrapper with `overflow: hidden`. Use your normal CSS. Anything the page can load, the template can use.

### 2. Point `og:image` at the Worker

```html
<meta property="og:image" content="https://ogshot.example.com/render.png?url=https://example.com/posts/1&v=1725000000">
<meta property="og:image:type" content="image/png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
```

`url` is the page's canonical URL, URL-encoded. `v` is described below. A page without a template gets a 422.

### The `v` parameter

Facebook, X, Slack, and iMessage cache `og:image` by URL, some effectively forever. The Worker can't do anything about that, so the URL has to change when the image should. Pass something that changes when the card content changes: the record's last-modified timestamp, a content hash, a cache key.

The Worker keys its cache on `v` together with the template's content. A new `v` always renders fresh, which also covers changes the template hash can't see, like an edited stylesheet or a replaced image at the same URL. If you forget to bump `v`, a template edit still triggers a render, but crawlers that already cached the old URL won't see it until `v` changes. With `v` present the response is `immutable` with a one-year max-age; without it, one day.

### 3. Include the client script on every page

```html
<script src="https://ogshot.example.com/ogshot.js" async fetchpriority="low"></script>
```

This goes in production, on every page that has an `og:image` pointing at the Worker. Not just in development.

It does two things:

- **Warms the cache.** Crawlers give up after a few seconds and a first render can take that long. The person sharing a link almost always loaded the page first, so the script finds the page's `og:image` tag and sends it a HEAD request. The Worker renders and caches the image and returns headers only. By the time anyone pastes the link into Slack or X, the image is a cache hit.
- **Previews the template.** Open any page with `?ogshot-preview` appended and the script swaps the body for your template at 1200x630 so you can tweak it in devtools. Same code the renderer runs.

The script has no effect on page load. It's a few kilobytes, loaded `async` at low priority and cached for a day, and the warm-up waits for the window `load` event and then an idle period before sending a low-priority request whose response has no body. It fires once per page URL per browser session. Nothing it does shows up in Core Web Vitals.

The Worker never depends on the script. Without it, warm the cache yourself by requesting the image URL when you publish. That's also the right move when one deploy changes many pages at once, since no visitor has seen the new pages yet.

## Preview in development

With the client script included, append `?ogshot-preview` to any local page.

To see a real PNG of a local page, expose it with `cloudflared tunnel --url localhost:3000`, add the tunnel host to `ALLOWED_HOSTS`, and request `/render.png?url=<tunnel url>`.

## Fonts and images

Before the screenshot, the renderer waits for the page's stylesheets, for every `<img>` and CSS background image inside the template, and for `document.fonts.ready`, which resolves when every font the layout requested has loaded. Web fonts normally make it into the image. The only time they don't is when a font request takes longer than five seconds.

To keep renders fast, the browser is handed the HTML the Worker already fetched instead of downloading the page again, and requests that can't affect the image are blocked: third-party scripts, iframes, media, and websockets. First-party scripts still run. If your template depends on a script from another domain, inline it or serve it from your own.

If you want to remove even that possibility, preload the fonts the template uses:

```html
<link rel="preload" href="/fonts/inter.woff2" as="font" type="font/woff2" crossorigin>
```

Preloaded fonts are already in memory when the swap happens, so there's nothing to wait for.

## Local development

```sh
npm install
cp .dev.vars.example .dev.vars
npm run dev
```

Edit `.dev.vars` to list the hosts you want to render locally. Browser Rendering has no local emulation. The binding is configured with `remote: true`, so `wrangler dev` runs the Worker locally but sends screenshots through your Cloudflare account. You need to be logged in with `wrangler login`.

```sh
npm test
```

## Endpoints

| Path | Description |
|---|---|
| `GET /render.png?url=<page>&v=<version>` | The PNG. `url` must be on `ALLOWED_HOSTS`. HEAD renders and caches without returning the body. |
| `GET /ogshot.js` | The client script: cache warming and `?ogshot-preview`. |
| `GET /` | A short description. |

Responses include `x-ogshot-cache: HIT` or `MISS`. Misses also carry a `Server-Timing` header with the time spent fetching the page, getting a browser, loading, swapping in the template, screenshotting, and re-encoding.

The PNG is re-encoded losslessly after the screenshot. Chromium's encoder favors speed, and the re-encode is typically 30 to 40 percent smaller with identical pixels. That matters for gradient-heavy cards, which otherwise land near the 300 KB limit some messaging apps apply to preview images.

## Notes

- The Cache API is per data center, so the first crawler to hit a given region triggers one render there. Expect a few misses per image, not one.
- Templates should be static HTML and CSS. The renderer waits for stylesheets, images, and fonts, not for your JavaScript.
- Each cache-warming HEAD costs the Worker one fetch of your page HTML to compute the key. Negligible for most sites; if yours is very high traffic, skip the script and warm on publish instead.
