import { GetObjectCommand } from "@aws-sdk/client-s3";
import type { Response } from "express";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createR2S3Client, getR2Config } from "./r2-config.js";
import { logger } from "./logger.js";

export function parseR2ObjectKeyFromPublicUrl(
  imageUrl: string,
  publicBase: string,
): string | null {
  try {
    const url = new URL(imageUrl);
    const base = new URL(publicBase);
    if (url.origin !== base.origin) return null;

    const key = url.pathname.replace(/^\//, "");
    return decodeURIComponent(key);
  } catch {
    return null;
  }
}

export async function streamRenderImageDownload(
  outputImageUrl: string,
  res: Response,
  filename: string,
): Promise<void> {
  const config = getR2Config();
  const objectKey =
    config != null
      ? parseR2ObjectKeyFromPublicUrl(outputImageUrl, config.publicUrl)
      : null;

  if (config != null && objectKey != null) {
    try {
      const client = createR2S3Client(config);
      const result = await client.send(
        new GetObjectCommand({
          Bucket: config.bucket,
          Key: objectKey,
        }),
      );

      if (!result.Body) {
        throw new Error("R2 object body empty");
      }

      res.setHeader("Content-Type", result.ContentType ?? "application/octet-stream");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      if (result.ContentLength != null) {
        res.setHeader("Content-Length", String(result.ContentLength));
      }

      await pipeline(result.Body as Readable, res);
      return;
    } catch (error) {
      logger.warn(
        {
          objectKey,
          outputImageUrl,
          err: error instanceof Error ? error.message : String(error),
        },
        "render-download: R2 GetObject failed, falling back to upstream fetch",
      );
    }
  }

  const upstream = await fetch(outputImageUrl, { redirect: "follow" });
  if (!upstream.ok) {
    throw new Error(`Upstream download failed: HTTP ${upstream.status}`);
  }

  const contentType = upstream.headers.get("content-type") ?? "application/octet-stream";
  const buffer = Buffer.from(await upstream.arrayBuffer());

  res.setHeader("Content-Type", contentType);
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("Content-Length", String(buffer.length));
  res.send(buffer);
}
