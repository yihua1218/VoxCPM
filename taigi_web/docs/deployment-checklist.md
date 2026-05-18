# Deployment Checklist

Use this checklist when moving Taigi Voice Video Web to the split frontend,
static CDN, and backend API deployment.

## 1. Build Frontend

```bash
cd taigi_web/frontend
npm install

VITE_PREFER_STATIC_DATA=true \
VITE_STATIC_DATA_BASE_URL=https://static-taigi.yihua.app/public \
VITE_API_BASE_URL=https://api-taigi.yihua.app \
npm run build
```

The generated frontend lives in:

```text
taigi_web/frontend/dist
```

## 2. Configure Backend Environment

Backend `.env`:

```bash
TAIGI_WEB_PUBLIC_URL=https://taigi.yihua.app
TAIGI_WEB_PUBLIC_STATIC_URL=https://static-taigi.yihua.app
TAIGI_WEB_CORS_ORIGINS=https://taigi.yihua.app,https://xn--kpr858j.yihua.app,http://localhost:5173,http://127.0.0.1:5174
```

Restart the backend after changes.

## 3. Configure Cloudflare DNS

Required records:

```text
taigi.yihua.app             frontend hosting
xn--kpr858j.yihua.app       frontend alias or redirect
static-taigi.yihua.app      R2 custom domain
api-taigi.yihua.app         HAProxy / backend API
```

Use one-level subdomains to avoid nested-subdomain certificate coverage issues.

## 4. Configure R2 CORS

R2 bucket CORS:

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

## 5. Configure AWS Profile For R2

```bash
aws configure --profile r2
```

Values:

```text
AWS Access Key ID: R2 access key id
AWS Secret Access Key: R2 secret access key
Default region name: auto
Default output format: json
```

Test a bucket-specific operation:

```bash
aws s3 ls s3://YOUR_BUCKET \
  --profile r2 \
  --endpoint-url https://YOUR_ACCOUNT_ID.r2.cloudflarestorage.com \
  --region auto
```

If `aws s3 ls` without a bucket returns `Unauthorized`, that can be normal for a
bucket-scoped token. Test `s3://YOUR_BUCKET` directly.

## 6. Sync Static Data And Media

From repo root:

```bash
aws s3 sync taigi_web_jobs/public_static/public s3://YOUR_BUCKET/public \
  --profile r2 \
  --endpoint-url https://YOUR_ACCOUNT_ID.r2.cloudflarestorage.com \
  --region auto \
  --delete
```

Expected public URL:

```text
https://static-taigi.yihua.app/public/index.json
```

## 7. Optional: Sync Frontend To Same R2 Bucket

Only use this if `taigi.yihua.app` is also hosted from R2.

First deployment, avoid `--delete`:

```bash
aws s3 sync taigi_web/frontend/dist s3://YOUR_BUCKET/ \
  --profile r2 \
  --endpoint-url https://YOUR_ACCOUNT_ID.r2.cloudflarestorage.com \
  --region auto
```

Later, if cleanup is needed:

```bash
aws s3 sync taigi_web/frontend/dist s3://YOUR_BUCKET/ \
  --profile r2 \
  --endpoint-url https://YOUR_ACCOUNT_ID.r2.cloudflarestorage.com \
  --region auto \
  --delete \
  --exclude "public/*"
```

If R2 is used for the frontend before Cloudflare Pages is ready, add a Worker
route:

```text
taigi.yihua.app/*
```

Use the script in:

```text
taigi_web/docs/cloudflare-worker-r2-frontend.js
```

This rewrites `/` and SPA paths to `/index.html` while leaving `/assets/...`
and `/public/...` object paths intact.

## 8. HAProxy Rule

`api-taigi.yihua.app` should route to the Taigi backend.

Validate before reload:

```bash
haproxy -c -f /etc/haproxy.cfg
```

Reload:

```bash
/etc/init.d/haproxy reload
```

Test from the HAProxy host:

```bash
printf 'GET /api/info HTTP/1.1\r\nHost: api-taigi.yihua.app\r\nConnection: close\r\n\r\n' \
  | openssl s_client -connect 127.0.0.1:443 -servername api-taigi.yihua.app -quiet
```

Expected:

```text
HTTP/1.1 200 OK
content-type: application/json
```

## 9. Browser Verification

Open:

```text
https://taigi.yihua.app/
```

Check Network:

- Public snapshot requests go to `https://static-taigi.yihua.app/public/...`.
- Media requests go to `https://static-taigi.yihua.app/public/media/...`.
- Anonymous browsing does not poll `https://api-taigi.yihua.app/jobs` every 2.5
  seconds.
- Login, admin, and create job actions call `https://api-taigi.yihua.app/...`.

## 10. Rollback Notes

- Keep old HAProxy host rules until the new API host is stable.
- Keep old DNS records until frontend env has been redeployed.
- If R2 CORS fails, frontend may show empty lists or media playback errors.
- If the frontend is hosted from the same R2 bucket as `/public`, do not run root
  sync with `--delete` unless `--exclude "public/*"` is present.
