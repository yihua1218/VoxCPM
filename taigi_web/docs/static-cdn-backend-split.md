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
taigi.example.com
  Public frontend app: index.html, JS, CSS, og-image.png.

taigi-alt.example.com
  Optional frontend alias or redirect to taigi.example.com.

static-taigi.example.com
  R2 custom domain for public snapshots and generated media.

api-taigi.example.com
  FastAPI backend behind HAProxy.
```

Avoid deeper hosts such as `api.taigi.example.com` and
`static.taigi.example.com` unless a certificate covering `*.taigi.example.com` is
installed. Cloudflare Universal SSL normally covers `yihua.app` and
`*.yihua.app`, not nested subdomains.

## URL Responsibilities

Frontend app:

```text
https://taigi.example.com/
https://taigi.example.com/index.html
https://taigi.example.com/assets/...
```

Static data and media:

```text
https://static-taigi.example.com/public/index.json
https://static-taigi.example.com/public/jobs/index.json
https://static-taigi.example.com/public/lexicon/index.json
https://static-taigi.example.com/public/stats.json
https://static-taigi.example.com/public/media/...
```

Backend API:

```text
https://api-taigi.example.com/api/info
https://api-taigi.example.com/auth/status
https://api-taigi.example.com/jobs
https://api-taigi.example.com/admin/static/sync
```

`https://static-taigi.example.com/index.html` is not required in the recommended
layout. The static host is a data/media host, and its public index is
`/public/index.json`.

## Frontend Environment

For a public frontend deployment:

```bash
VITE_PREFER_STATIC_DATA=true
VITE_STATIC_DATA_BASE_URL=https://static-taigi.example.com/public
VITE_API_BASE_URL=https://api-taigi.example.com
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
VITE_STATIC_DATA_BASE_URL=https://static-taigi.example.com/public \
VITE_API_BASE_URL=http://127.0.0.1:8876 \
npm run dev
```

Use `http://localhost:5173/` for the frontend during local development.

## Backend Environment

On the backend server:

```bash
TAIGI_WEB_PUBLIC_URL=https://taigi.example.com
TAIGI_WEB_PUBLIC_STATIC_URL=https://static-taigi.example.com
TAIGI_WEB_CORS_ORIGINS=https://taigi.example.com,https://taigi-alt.example.com,http://localhost:5173,http://127.0.0.1:5174
```

`TAIGI_WEB_PUBLIC_URL` is used for magic login links. It should point users back
to the frontend, not the API host.

`TAIGI_WEB_CORS_ORIGINS` must list browser origins that are allowed to call
`api-taigi.example.com`.

## Cloudflare DNS

Create records similar to:

```text
taigi.example.com             -> frontend static hosting target
taigi-alt.example.com       -> frontend alias or redirect target
static-taigi.example.com      -> R2 custom domain
api-taigi.example.com         -> HAProxy public endpoint
```

If `api-taigi.example.com` points to the same HAProxy endpoint as the old backend
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
      "https://taigi.example.com",
      "https://taigi-alt.example.com",
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
  https://static-taigi.example.com/public/jobs/index.json \
  -o /tmp/taigi-jobs.json
```

Expected header:

```text
access-control-allow-origin: http://localhost:5173
```

## HAProxy

`api-taigi.example.com` should route to the same backend as the existing Taigi
backend during migration.

Current pattern:

```haproxy
acl is_taigi_voice hdr(host) -i taigi-alt.example.com
acl is_taigi_voice hdr(host) -i taigi.example.com
acl is_taigi_voice hdr(host) -i api-taigi.example.com
acl is_taigi_voice ssl_fc_sni taigi-alt.example.com
acl is_taigi_voice ssl_fc_sni taigi.example.com
acl is_taigi_voice ssl_fc_sni api-taigi.example.com

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
env, and monitoring confirm that `api-taigi.example.com` is the active API host.

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
https://static-taigi.example.com/public/...
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
taigi.example.com/*
```

Optional second route if the Taigi punycode domain should serve the same app:

```text
taigi-alt.example.com/*
```

Worker script:

```js
const ASSET_ORIGIN = "https://static-taigi.example.com";

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
https://taigi.example.com/         -> R2 /index.html
https://taigi.example.com/assets/  -> R2 /assets/
https://taigi.example.com/anything -> R2 /index.html for SPA fallback
```

The frontend still reads public snapshots and media from:

```text
https://static-taigi.example.com/public/...
```

## Expected Tests

Static snapshot:

```bash
curl -I https://static-taigi.example.com/public/index.json
curl https://static-taigi.example.com/public/index.json
```

Static media:

```bash
curl -I https://static-taigi.example.com/public/media/...
```

Backend:

```bash
curl https://api-taigi.example.com/api/info
```

Frontend:

```bash
curl -I https://taigi.example.com/
```

Browser checks:

- `taigi.example.com` loads without a blank screen.
- Network tab shows anonymous `jobs`, `lexicon`, and `stats` coming from
  `static-taigi.example.com`.
- Audio and video request URLs return `200` or `206`, not `index.html`.
- Login and job creation call `api-taigi.example.com`.

## Troubleshooting

Blank page with `Cannot read properties of undefined (reading 'filter')`:

- The frontend received an unexpected JSON shape or API response. The app now
  guards against non-array `jobs` and `words`, but inspect Network responses if
  it returns.

Media controls show but do not play:

- Check whether the media URL returns `text/html`; if so, the dev proxy or
  static path is wrong.
- Check `Content-Type`, `Accept-Ranges`, and CORS.
- Static media should load from `static-taigi.example.com/public/media/...`.

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
  https://static-taigi.example.com/public/jobs/index.json

curl -o /dev/null -sS -w 'api jobs %{time_total}s %{http_code}\n' \
  https://api-taigi.example.com/jobs
```
