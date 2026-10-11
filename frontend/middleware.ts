import { next } from "@vercel/functions";
import { buildShare, injectShare, isShareBot, ogImagePath, pagePathFromOg, shareHtml } from "./share/preview";
import { shareImage } from "./share/image";
import { shareJpeg } from "./share/jpeg";

export const config = {
  runtime: "nodejs",
  matcher: ["/((?!assets/|favicon.ico|fonts/).*)"],
};

export default async function middleware(request: Request) {
  const url = new URL(request.url);
  if (request.headers.get("x-gmeter-index") === "1" || url.pathname === "/index.html") return next();

  if (url.pathname.startsWith("/preview/") && /\.jpe?g$/i.test(url.pathname)) {
    const file = decodeURIComponent(url.pathname.slice("/preview/".length)).replace(/\.jpe?g$/i, "");
    const path = !file || file === "home" ? "/" : `/${file.replace(/__/g, "/")}`;
    const card = await buildShare(path);
    const jpeg = await shareJpeg(card);
    const body = new Uint8Array(jpeg);
    return new Response(body, {
      headers: {
        "content-type": "image/jpeg",
        "content-length": String(body.byteLength),
        "cache-control": "public, max-age=600",
      },
    });
  }

  const ogPage = pagePathFromOg(url.pathname);
  if (ogPage) {
    const card = await buildShare(ogPage);
    return shareImage(card);
  }

  if (url.pathname.startsWith("/api") || /\.[a-z0-9]+$/i.test(url.pathname)) return next();

  const destination = request.headers.get("sec-fetch-dest") || "";
  if (destination === "script" || destination === "style" || destination === "font" || destination === "image") {
    return next();
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
        "cache-control": "public, max-age=60",
      },
    });
  }

  if (!accept.includes("text/html") && destination !== "document") return next();

  const indexResponse = await fetch(new URL("/index.html", url.origin), {
    headers: { "x-gmeter-index": "1" },
  });
  if (!indexResponse.ok) return next();

  const card = await buildShare(path);
  return new Response(injectShare(await indexResponse.text(), card, pageUrl, imageUrl), {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=0, must-revalidate",
    },
  });
}
