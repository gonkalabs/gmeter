import { buildShare, injectShare, isShareBot, ogImagePath, pagePathFromOg } from "./share/preview";
import { shareJpeg } from "./share/image";

export const config = {
  runtime: "nodejs",
  matcher: ["/((?!assets/|favicon.ico).*)"],
};

export default async function middleware(request: Request) {
  const url = new URL(request.url);
  if (request.headers.get("x-gmeter-index") === "1" || url.pathname === "/index.html") return;

  const ogPage = pagePathFromOg(url.pathname);
  if (ogPage) {
    const card = await buildShare(ogPage);
    const jpeg = await shareJpeg(card);
    return new Response(jpeg, {
      headers: {
        "content-type": "image/jpeg",
        "content-length": String(jpeg.length),
        "cache-control": "public, max-age=600",
      },
    });
  }

  if (url.pathname.startsWith("/api") || url.pathname.startsWith("/assets")) return;
  if (/\.[a-z0-9]+$/i.test(url.pathname)) return;

  const destination = request.headers.get("sec-fetch-dest") || "";
  if (destination === "script" || destination === "style" || destination === "font" || destination === "image") {
    return;
  }

  const accept = request.headers.get("accept") || "";
  const userAgent = request.headers.get("user-agent") || "";
  const wantsDocument =
    isShareBot(userAgent) || accept.includes("text/html") || destination === "document" || destination === "";
  if (!wantsDocument) return;

  const indexResponse = await fetch(new URL("/index.html", url.origin), {
    headers: { "x-gmeter-index": "1" },
  });
  if (!indexResponse.ok) return;

  const path = url.pathname.replace(/\/+$/, "") || "/";
  const card = await buildShare(path);
  const pageUrl = `${url.origin}${path}`;
  const html = injectShare(await indexResponse.text(), card, pageUrl, `${url.origin}${ogImagePath(path)}`);
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=0, s-maxage=120",
    },
  });
}
