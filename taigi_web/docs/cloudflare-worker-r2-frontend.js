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
