// ---------------------------------------------------------------------------
// StudioLayer AI — Scene Cache (SL-017, Part 8)
//
// In-memory LRU cache for FLUX-generated scenes.
//
// Cache key: SHA-256 hash of the prompt string (first 16 hex chars).
// When an identical prompt is requested (same outfit recommendation, same
// style mode, same garment profile), the cached scene is reused as the
// FASHN model_image — the FLUX generation step is skipped entirely.
//
// This eliminates redundant generation cost when:
//   - Multiple users upload different garments with identical outfit plans
//   - The same render is retried after a client-side refresh
//   - Batch catalog rendering for the same garment across sizes/colourways
// ---------------------------------------------------------------------------

import crypto from "node:crypto";
import { logger } from "../lib/logger";
import { RENDERING_CONFIG } from "./rendering-config";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SceneCacheEntry {
  /** URL of the FLUX-generated scene image. */
  imageUrl: string;
  /** Unix timestamp (ms) when this entry was created. */
  timestamp: number;
  /** Provider name that generated this scene (e.g. "fal-ai/flux/schnell"). */
  provider: string;
  /** FLUX generation latency in ms — useful for performance analytics. */
  latencyMs: number;
  /** The prompt hash used as the cache key. Stored for diagnostics. */
  promptHash: string;
}

// ---------------------------------------------------------------------------
// Prompt hasher
// ---------------------------------------------------------------------------

/**
 * Returns a 16-character hex SHA-256 prefix of the prompt.
 * Sufficient for cache key uniqueness; compact for logging.
 */
export function hashPrompt(prompt: string): string {
  return crypto.createHash("sha256").update(prompt, "utf8").digest("hex").slice(0, 16);
}

// ---------------------------------------------------------------------------
// SceneCache
// ---------------------------------------------------------------------------

export class SceneCache {
  /** Internal map — insertion order is used for LRU eviction. */
  private readonly cache = new Map<string, SceneCacheEntry>();
  private readonly ttlMs: number;
  private readonly maxSize: number;

  constructor(
    ttlMs  = RENDERING_CONFIG.hybrid.cacheTtlMs,
    maxSize = RENDERING_CONFIG.hybrid.cacheMaxSize,
  ) {
    this.ttlMs   = ttlMs;
    this.maxSize = maxSize;
  }

  /**
   * Returns the cached entry for the given prompt hash, or null if:
   *   - No entry exists
   *   - The entry has expired (TTL exceeded)
   *   - Caching is disabled via SCENE_CACHE_ENABLED=false
   */
  get(promptHash: string): SceneCacheEntry | null {
    if (!RENDERING_CONFIG.hybrid.cacheEnabled) return null;

    const entry = this.cache.get(promptHash);
    if (!entry) return null;

    const ageMs = Date.now() - entry.timestamp;
    if (ageMs > this.ttlMs) {
      this.cache.delete(promptHash);
      logger.debug({ promptHash, ageMs, ttlMs: this.ttlMs }, "Scene cache: entry expired");
      return null;
    }

    return entry;
  }

  /**
   * Stores a generated scene in the cache.
   * If the cache is at capacity, the oldest entry is evicted (LRU behaviour
   * via Map's insertion-order iteration).
   */
  set(promptHash: string, entry: Omit<SceneCacheEntry, "promptHash">): void {
    if (!RENDERING_CONFIG.hybrid.cacheEnabled) return;

    // LRU eviction: remove the oldest insertion-order entry
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value as string | undefined;
      if (oldestKey) {
        this.cache.delete(oldestKey);
        logger.debug({ evictedKey: oldestKey, size: this.cache.size }, "Scene cache: LRU eviction");
      }
    }

    this.cache.set(promptHash, { ...entry, promptHash });
  }

  /** Current number of entries. */
  size(): number {
    return this.cache.size;
  }

  /** Diagnostic snapshot for health endpoints and logging. */
  stats(): {
    size: number;
    ttlMs: number;
    maxSize: number;
    enabled: boolean;
  } {
    return {
      size:    this.cache.size,
      ttlMs:   this.ttlMs,
      maxSize: this.maxSize,
      enabled: RENDERING_CONFIG.hybrid.cacheEnabled,
    };
  }
}
