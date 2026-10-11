import { buildShare } from "./preview";
import { shareJpeg } from "./jpeg";

function pathFromFile(file: string) {
  const name = decodeURIComponent(file).replace(/\.jpe?g$/i, "");
  if (!name || name === "home") return "/";
  return `/${name.replace(/__/g, "/")}`;
}

export default async function handler(req: any, res: any) {
  try {
    const file = String(req.query?.file || "home.jpg");
    const card = await buildShare(pathFromFile(file));
    const body = await shareJpeg(card);
    res.statusCode = 200;
    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Cache-Control", "public, max-age=600");
    res.setHeader("Content-Length", String(body.length));
    res.end(body);
  } catch (error) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "text/plain");
    res.end(error instanceof Error ? error.message : "preview failed");
  }
}
