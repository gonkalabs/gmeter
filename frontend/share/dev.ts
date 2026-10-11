import { buildShare, isShareBot, ogImagePath, pagePathFromOg, shareHtml } from "./preview";
import { shareImage } from "./image";

export function shareDevMiddleware() {
  return async (req: any, res: any, next: (error?: unknown) => void) => {
    try {
      const url = new URL(req.url || "/", "http://127.0.0.1");
      const ogPage = pagePathFromOg(url.pathname);
      if (ogPage) {
        const card = await buildShare(ogPage);
        const image = await shareImage(card);
        const bytes = Buffer.from(await image.arrayBuffer());
        res.statusCode = 200;
        res.setHeader("content-type", "image/png");
        res.setHeader("content-length", String(bytes.length));
        res.setHeader("cache-control", "public, max-age=300");
        res.end(bytes);
        return;
      }
      const path = url.pathname;
      const asset = path.includes(".") || path.startsWith("/@") || path.startsWith("/src") || path.startsWith("/api") || path.startsWith("/node_modules");
      const ua = String(req.headers["user-agent"] || "");
      if (!asset && isShareBot(ua)) {
        const card = await buildShare(path);
        const origin = `${req.headers["x-forwarded-proto"] || "http"}://${req.headers.host}`;
        const html = shareHtml(card, `${origin}${path}`, `${origin}${ogImagePath(path)}`);
        res.statusCode = 200;
        res.setHeader("content-type", "text/html; charset=utf-8");
        res.setHeader("cache-control", "public, max-age=300");
        res.end(html);
        return;
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}
