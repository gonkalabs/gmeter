// @ts-nocheck
import { PNG } from "pngjs";
import jpeg from "jpeg-js";
import { shareImage } from "./image";
import type { ShareCard } from "./preview";

export async function shareJpeg(card: ShareCard) {
  const rendered = await shareImage(card);
  const png = PNG.sync.read(Buffer.from(await rendered.arrayBuffer()));
  const encoded = jpeg.encode({ data: png.data, width: png.width, height: png.height }, 82);
  return Buffer.from(encoded.data);
}
