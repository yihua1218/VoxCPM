# Static CDN And Backend Split

This document records the current Taigi Voice Video Web plan for separating the
public frontend, static media storage, and backend API.

## Goals

- Public browsing should be fast and cheap.
- Generated audio, video, segment WAVs, and public JSON snapshots should be
  served from Cloudflare R2.
- The backend should handle only login, job creation, admin actions, generation,
  review writes, and static sync.
- The frontend should keep working when anonymous users only need public data.

## Domain Layout

Use one-level subdomains under `yihua.app` so Cloudflare Universal SSL covers
them without Advanced Certificate Manager.

```text
taigi.yihua.app
  Public frontend app: index.html, JS, CSS, og-image.png.

xn--kpr858j.yihua.app
  Optional frontend alias or redirect to taigi.yihua.app.

static-taigi.yihua.app
  R2 custom domain for public snapshots and generated media.

api-taigi.yihua.app
  FastAPI backend behind HAProxy.
```

Avoid deeper hosts such as `api.taigi.yihua.app` and
`static.taigi.yihua.app` unless a certificate covering `*.taigi.yihua.app` is
installed. Cloudflare Universal SSL normally covers `yihua.app` and
`*.yihua.app`, not nested subdomains.

## URL Responsibilities

Frontend app:

```text
https://taigi.yihua.app/
https://taigi.yihua.app/index.html
https://taigi.yihua.app/assets/...
```

Static data and media:

```text
https://static-taigi.yihua.app/public/index.json
https://static-taigi.yihua.app/public/jobs/index.json
https://static-taigi.yihua.app/public/lexicon/index.json
https://static-taigi.yihua.app/public/stats.json
https://static-taigi.yihua.app/public/media/...
```

Backend API:

```text
https://api-taigi.yihua.app/api/info
https://api-taigi.yihua.app/auth/status
https://api-taigi.yihua.app/jobs
https://api-taigi.yihua.app/admin/static/sync
```

`https://static-taigi.yihua.app/index.html` is not required in the recommended
layout. The static host is a data/media host, and its public index is
`/public/index.json`.

## Frontend Environment

For a public frontend deployment:

```bash
VITE_PREFER_STATIC_DATA=true
VITE_STATIC_DATA_BASE_URL=https://static-taigi.yihua.app/public
VITE_API_BASE_URL=https://api-taigi.yihua.app
```

Behavior:

- Anonymous users load `jobs/index.json`, `lexicon/index.json`, `stats.json`,
  and job segment JSON from R2 first.
- Anonymous browsing does not poll `/jobs`, `/words`, or `/stats` on the
  backend every few seconds.
- Login links, admin actions, job creation, ratings, review writes, and
  generation requests use the backend API.
- After a user is signed in, live API polling is enabled for queue and job
  status.

Local development for the split mode:

```bash
cd taigi_web/frontend

VITE_PREFER_STATIC_DATA=true \
VITE_STATIC_DATA_BASE_URL=https://static-taigi.yihua.app/public \
VITE_API_BASE_URL=http://127.0.0.1:8876 \
npm run dev
```

Use `http://localhost:5173/` for the frontend during local development.

## Backend Environment

On the backend server:

```bash
TAIGI_WEB_PUBLIC_URL=https://taigi.yihua.app
TAIGI_WEB_PUBLIC_STATIC_URL=https://static-taigi.yihua.app
TAIGI_WEB_CORS_ORIGINS=https://taigi.yihua.app,https://xn--kpr858j.yihua.app,http://localhost:5173,http://127.0.0.1:5174
```

`TAIGI_WEB_PUBLIC_URL` is used for magic login links. It should point users back
to the frontend, not the API host.

`TAIGI_WEB_CORS_ORIGINS` must list browser origins that are allowed to call
`api-taigi.yihua.app`.

## Cloudflare DNS

Create records similar to:

```text
taigi.yihua.app             -> frontend static hosting target
xn--kpr858j.yihua.app       -> frontend alias or redirect target
static-taigi.yihua.app      -> R2 custom domain
api-taigi.yihua.app         -> HAProxy public endpoint
```

If `api-taigi.yihua.app` points to the same HAProxy endpoint as the old backend
host, use either:

```text
Type: CNAME
Name: api-taigi
Target: existing HAProxy host
Proxy status: Proxied
```

or:

```text
Type: A
Name: api-taigi
IPv4 address: HAProxy public IP
Proxy status: Proxied
```

Use HTTPS URLs in frontend configuration. Do not use `http://api-taigi...` from
an HTTPS frontend, because browsers block mixed content.

## R2 CORS

Set the R2 bucket CORS policy to allow frontend origins:

```json
[
  {
    "AllowedOrigins": [
      "https://taigi.yihua.app",
      "https://xn--kpr858j.yihua.app",
      "http://localhost:5173"
    ],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["Content-Length", "Content-Type", "ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

After changing CORS, purge Cloudflare cache or wait for cached responses to
expire. A good test is:

```bash
curl -sS -H 'Origin: http://localhost:5173' -D - \
  https://static-taigi.yihua.app/public/jobs/index.json \
  -o /tmp/taigi-jobs.json
```

Expected header:

```text
access-control-allow-origin: http://localhost:5173
```

## HAProxy

`api-taigi.yihua.app` should route to the same backend as the existing Taigi
backend during migration.

Current pattern:

```haproxy
acl is_taigi_voice hdr(host) -i xn--kpr858j.yihua.app
acl is_taigi_voice hdr(host) -i taigi.yihua.app
acl is_taigi_voice hdr(host) -i api-taigi.yihua.app
acl is_taigi_voice ssl_fc_sni xn--kpr858j.yihua.app
acl is_taigi_voice ssl_fc_sni taigi.yihua.app
acl is_taigi_voice ssl_fc_sni api-taigi.yihua.app

use_backend be_taigi_voice if is_taigi_voice

backend be_taigi_voice
  mode http
  option http-server-close
  http-request set-header X-Forwarded-Proto https
  http-request set-header X-Forwarded-Host %[req.hdr(Host)]
  timeout server 120000ms
  server srv_taigi_voice 192.168.1.100:8876 check
```

Keep the old host rules during migration. Remove them only after DNS, frontend
env, and monitoring confirm that `api-taigi.yihua.app` is the active API host.

Validate before reload:

```bash
haproxy -c -f /etc/haproxy.cfg
```

Then reload through the host's service manager, for example:

```bash
/etc/init.d/haproxy reload
```

## R2 Sync Strategy

The server writes public snapshots and media under:

```text
taigi_web_jobs/public_static/public
```

The R2 custom domain should expose that as:

```text
https://static-taigi.yihua.app/public/...
```

Recommended sync for public data and media:

```bash
aws s3 sync taigi_web_jobs/public_static/public s3://YOUR_BUCKET/public \
  --profile r2 \
  --endpoint-url https://YOUR_ACCOUNT_ID.r2.cloudflarestorage.com \
  --region auto \
  --delete
```

The `--delete` flag is safe here because this command only owns the `/public`
prefix.

## If Frontend And Media Share One R2 Bucket

This is possible, but be careful with `--delete`.

Object layout:

```text
/
  index.html
  assets/
  og-image.png
  public/
    index.json
    jobs/
    lexicon/
    stats.json
    media/
```

Sync frontend app to bucket root without `--delete` at first:

```bash
aws s3 sync taigi_web/frontend/dist s3://YOUR_BUCKET/ \
  --profile r2 \
  --endpoint-url https://YOUR_ACCOUNT_ID.r2.cloudflarestorage.com \
  --region auto
```

Sync public data and media to `/public` with `--delete`:

```bash
aws s3 sync taigi_web_jobs/public_static/public s3://YOUR_BUCKET/public \
  --profile r2 \
  --endpoint-url https://YOUR_ACCOUNT_ID.r2.cloudflarestorage.com \
  --region auto \
  --delete
```

Do not run this command against the bucket root with `--delete`:

```bash
aws s3 sync taigi_web/frontend/dist s3://YOUR_BUCKET/ --delete
```

It can delete the `public/` prefix because `public/` is not present in
`frontend/dist`.

After the layout is stable, frontend root sync may use:

```bash
aws s3 sync taigi_web/frontend/dist s3://YOUR_BUCKET/ \
  --profile r2 \
  --endpoint-url https://YOUR_ACCOUNT_ID.r2.cloudflarestorage.com \
  --region auto \
  --delete \
  --exclude "public/*"
```

## Temporary Frontend Hosting With A Worker

Cloudflare R2 custom domains do not provide a full static-site index document
setting for `/`. If the frontend is stored in the R2 bucket root, use a Worker
while Cloudflare Pages or GitHub Actions are not ready.

Worker route:

```text
taigi.yihua.app/*
```

Optional second route if the Taigi punycode domain should serve the same app:

```text
xn--kpr858j.yihua.app/*
```

Worker script:

```js
const ASSET_ORIGIN = "https://static-taigi.yihua.app";

function frontendPath(pathname) {
  if (pathname === "/") return "/index.html";
  if (pathname.startsWith("/public/")) return pathname;
  if (pathname.includes(".")) return pathname;
  return "/index.html";
}

export default {
  async fetch(request) {
    const sourceUrl = new URL(request.url);
    const assetUrl = new URL(ASSET_ORIGIN);
    assetUrl.pathname = frontendPath(sourceUrl.pathname);
    assetUrl.search = assetUrl.pathname === "/index.html" ? "" : sourceUrl.search;

    const headers = new Headers(request.headers);
    headers.set("Host", assetUrl.host);

    return fetch(new Request(assetUrl.toString(), {
      method: request.method,
      headers,
      body: request.body,
      redirect: "follow",
    }));
  },
};
```

The same script is saved at:

```text
taigi_web/docs/cloudflare-worker-r2-frontend.js
```

This keeps:

```text
https://taigi.yihua.app/         -> R2 /index.html
https://taigi.yihua.app/assets/  -> R2 /assets/
https://taigi.yihua.app/anything -> R2 /index.html for SPA fallback
```

The frontend still reads public snapshots and media from:

```text
https://static-taigi.yihua.app/public/...
```

## Expected Tests

Static snapshot:

```bash
curl -I https://static-taigi.yihua.app/public/index.json
curl https://static-taigi.yihua.app/public/index.json
```

Static media:

```bash
curl -I https://static-taigi.yihua.app/public/media/...
```

Backend:

```bash
curl https://api-taigi.yihua.app/api/info
```

Frontend:

```bash
curl -I https://taigi.yihua.app/
```

Browser checks:

- `taigi.yihua.app` loads without a blank screen.
- Network tab shows anonymous `jobs`, `lexicon`, and `stats` coming from
  `static-taigi.yihua.app`.
- Audio and video request URLs return `200` or `206`, not `index.html`.
- Login and job creation call `api-taigi.yihua.app`.

## Troubleshooting

Blank page with `Cannot read properties of undefined (reading 'filter')`:

- The frontend received an unexpected JSON shape or API response. The app now
  guards against non-array `jobs` and `words`, but inspect Network responses if
  it returns.

Media controls show but do not play:

- Check whether the media URL returns `text/html`; if so, the dev proxy or
  static path is wrong.
- Check `Content-Type`, `Accept-Ranges`, and CORS.
- Static media should load from `static-taigi.yihua.app/public/media/...`.

R2 CORS still missing:

- Confirm the R2 bucket CORS policy.
- Purge Cloudflare cache for affected objects.
- Test with a specific `Origin` header.

Slow anonymous page load:

- Confirm `VITE_PREFER_STATIC_DATA=true`.
- Confirm the frontend is not polling `/jobs`, `/words`, or `/stats` before
  login.
- Compare timings:

```bash
curl -o /dev/null -sS -w 'r2 jobs %{time_total}s %{http_code}\n' \
  https://static-taigi.yihua.app/public/jobs/index.json

curl -o /dev/null -sS -w 'api jobs %{time_total}s %{http_code}\n' \
  https://api-taigi.yihua.app/jobs
```
