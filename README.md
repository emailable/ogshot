# ogshot

Open Graph images from your own HTML and CSS, rendered and cached on Cloudflare Workers.

Put a `<template data-ogshot>` on any page. ogshot loads the page in headless Chromium, swaps the body for your template at 1200x630, screenshots it, and caches the PNG at the edge. Your existing styles, fonts, and templating language all work because it's just your page.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/jclusso/ogshot)

## How it works

1. A crawler requests `https://ogshot.example.com/render?url=https://example.com/posts/1&v=1725000000`.
2. The Worker fetches the page HTML, pulls out the template, and hashes it. That hash is the cache key.
3. On a miss, it opens the page in [Browser Rendering](https://developers.cloudflare.com/browser-rendering/), replaces the body with the template, waits for images and fonts, and screenshots.
4. The PNG is stored in the Workers Cache API and served with long cache headers.

Pages without a template get a plain fallback card built from the title, description, and site name.

## Deploy

Click the button above, or:

```sh
git clone https://github.com/jclusso/ogshot
cd ogshot
npm install
npx wrangler deploy
```

Then set `ALLOWED_HOSTS` in `wrangler.jsonc` (or in the dashboard under Settings, Variables) to the hosts you want to render:

```jsonc
"vars": {
  "ALLOWED_HOSTS": "example.com,*.example.com"
}
```

Exact hosts match exactly. `*.example.com` matches any subdomain but not the apex. Anything else gets a 403, so nobody can spend your browser quota screenshotting other sites.

Values set in the dashboard survive later deploys. The `vars` block in the config only seeds the first deploy, so you can keep the file generic and configure each deployment in the UI.

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
<meta property="og:image" content="https://ogshot.example.com/render?url=https://example.com/posts/1&v=1725000000">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
```

`url` is the page's canonical URL, URL-encoded. `v` is described below.

### The `v` parameter

Facebook, X, Slack, and iMessage cache `og:image` by URL, some effectively forever. The Worker can't do anything about that, so the URL has to change when the image should. Pass something that changes when the card content changes: the record's last-modified timestamp, a content hash, a cache key.

The Worker keys its cache on `v` together with the template's content. A new `v` always renders fresh, which also covers changes the template hash can't see, like an edited stylesheet or a replaced image at the same URL. If you forget to bump `v`, a template edit still triggers a render, but crawlers that already cached the old URL won't see it until `v` changes. With `v` present the response is `immutable` with a one-year max-age; without it, one day.

## Preview in development

Include the preview script on your pages in development:

```html
<script src="https://ogshot.example.com/preview.js" defer></script>
```

Then open any page with `?ogshot-preview` appended. The script swaps the body for your template at 1200x630 so you can tweak it in devtools. This is exactly what the Worker does before it screenshots, using the same code.

The script does nothing without the query param, so it's harmless if it ships to production. The Worker never depends on it.

To see a real PNG of a local page, expose it with `cloudflared tunnel --url localhost:3000`, add the tunnel host to `ALLOWED_HOSTS`, and request `/render?url=<tunnel url>`.

## Fonts and images

Before the screenshot, the renderer waits for every `<img>` in the template to finish loading, for `document.fonts.ready`, and then for the network to go quiet. `document.fonts.ready` resolves when every font the layout requested has loaded, so web fonts normally make it into the image. The only time they don't is when a font request takes longer than five seconds.

If you want to remove even that possibility, preload the fonts the template uses:

```html
<link rel="preload" href="/fonts/inter.woff2" as="font" type="font/woff2" crossorigin>
```

Preloaded fonts are already in memory when the swap happens, so there's nothing to wait for.

## Local development

```sh
npm install
npm run dev
```

Browser Rendering has no local emulation. The binding is configured with `remote: true`, so `wrangler dev` runs the Worker locally but sends screenshots through your Cloudflare account. You need to be logged in with `wrangler login`.

```sh
npm test
```

## Endpoints

| Path | Description |
|---|---|
| `GET /render?url=<page>&v=<version>` | The PNG. `url` must be on `ALLOWED_HOSTS`. |
| `GET /preview.js` | The dev preview script. |
| `GET /` | A short description. |

Responses include `x-ogshot-cache: HIT` or `MISS`.

## Notes

- The Cache API is per data center, so the first crawler to hit a given region triggers one render there. Expect a few misses per image, not one.
- Templates should be static HTML and CSS. The renderer waits for images and fonts, not for your JavaScript.
