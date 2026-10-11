import { buildShare, injectShare, isShareBot, ogImagePath, pagePathFromOg, shareHtml } from "./share/preview";
import { shareImage } from "./share/image";

export const config = {
  matcher: ["/((?!assets/|favicon.ico|fonts/).*)"],
};

export default async function middleware(request: Request) {
  const url = new URL(request.url);
  if (request.headers.get("x-gmeter-index") === "1") return;
  if (url.pathname === "/index.html" || url.pathname.startsWith("/fonts/")) return;

  const ogPage = pagePathFromOg(url.pathname);
  if (ogPage) {
    const card = await buildShare(ogPage);
    return shareImage(card);
  }

  if (url.pathname.startsWith("/api")) return;
  if (/\.[a-z0-9]+$/i.test(url.pathname)) return;

  const destination = request.headers.get("sec-fetch-dest") || "";
  if (destination === "script" || destination === "style" || destination === "font" || destination === "image") {
    return;
  }

  const accept = request.headers.get("accept") || "";
  const userAgent = request.headers.get("user-agent") || "";
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const pageUrl = `${url.origin}${path === "/" ? "/" : path}`;
  const imageUrl = `${url.origin}${ogImagePath(path)}`;

  if (isShareBot(userAgent)) {
    const card = await buildShare(path);
    return new Response(shareHtml(card, pageUrl, imageUrl), {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "public, max-age=300",
      },
    });
  }

  if (!accept.includes("text/html") && destination !== "document") return;

  const indexResponse = await fetch(new URL("/index.html", url.origin), {
    headers: { "x-gmeter-index": "1" },
  });
  if (!indexResponse.ok) return;

  const card = await buildShare(path);
  const html = injectShare(await indexResponse.text(), card, pageUrl, imageUrl);
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=0, must-revalidate",
    },
  });
}
