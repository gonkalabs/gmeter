import { buildShare, isShareBot, ogImagePath, pagePathFromOg, shareHtml } from "./share/preview";
import { shareImage } from "./share/image";

export const config = {
  matcher: ["/((?!assets/|favicon.ico).*)"],
};

export default async function middleware(request: Request) {
  const url = new URL(request.url);
  const ogPage = pagePathFromOg(url.pathname);
  if (ogPage) {
    const card = await buildShare(ogPage);
    return shareImage(card);
  }

  const userAgent = request.headers.get("user-agent") || "";
  const asset = /\.[a-z0-9]+$/i.test(url.pathname);
  if (asset || !isShareBot(userAgent)) return;

  const path = url.pathname.replace(/\/+$/, "") || "/";
  const card = await buildShare(path);
  const pageUrl = `${url.origin}${path === "/" ? "/" : path}`;
  return new Response(shareHtml(card, pageUrl, `${url.origin}${ogImagePath(path)}`), {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=300",
    },
  });
}
