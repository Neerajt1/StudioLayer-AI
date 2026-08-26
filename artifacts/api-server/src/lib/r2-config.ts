import { HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";

const R2_ENV_KEYS = [
  "R2_ACCOUNT_ID",
  "R2_BUCKET",
  "R2_ENDPOINT",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_PUBLIC_URL",
] as const;

export type R2Config = {
  accountId: string;
  bucket: string;
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicUrl: string;
};

export function getMissingR2EnvKeys(): string[] {
  return R2_ENV_KEYS.filter((key) => !process.env[key]?.trim());
}

export function getR2Config(): R2Config | null {
  const missing = getMissingR2EnvKeys();
  if (missing.length > 0) return null;

  return {
    accountId: process.env.R2_ACCOUNT_ID!.trim(),
    bucket: process.env.R2_BUCKET!.trim(),
    endpoint: process.env.R2_ENDPOINT!.trim(),
    accessKeyId: process.env.R2_ACCESS_KEY_ID!.trim(),
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!.trim(),
    publicUrl: process.env.R2_PUBLIC_URL!.replace(/\/+$/, ""),
  };
}

export function createR2S3Client(config: R2Config): S3Client {
  return new S3Client({
    region: "auto",
    endpoint: config.endpoint,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}

/** Startup check — logs ✓ R2 connected or ✗ Missing/failed R2 configuration. */
export async function validateR2Storage(): Promise<void> {
  const probe = await probeR2StorageHealth();
  if (probe.status === "not_monitored") {
    console.error(`✗ Missing R2 configuration`);
    return;
  }
  if (probe.status === "healthy") {
    console.log("✓ R2 connected");
    return;
  }
  console.error(`✗ R2 configuration present but connection failed`);
}

/** Admin-safe R2 probe — no secrets in the response. */
export async function probeR2StorageHealth(): Promise<{
  status: "healthy" | "attention" | "down" | "not_monitored";
  detail: string;
}> {
  const missing = getMissingR2EnvKeys();
  if (missing.length > 0) {
    return {
      status: "not_monitored",
      detail: "Object storage environment is not fully configured",
    };
  }

  const config = getR2Config()!;
  const client = createR2S3Client(config);

  try {
    await client.send(new HeadBucketCommand({ Bucket: config.bucket }));
    return { status: "healthy", detail: "Object storage bucket reachable" };
  } catch {
    return {
      status: "down",
      detail: "Object storage bucket is not reachable",
    };
  }
}
