// ---------------------------------------------------------------------------
// StudioLayer AI — Rendering Strategy Interface (SL-017, Part 2)
//
// Every rendering strategy must implement this interface.
// The Render Orchestrator depends only on this interface — it never imports
// or calls concrete strategy classes directly after construction.
//
// Adding a new strategy (e.g. VideoRenderingStrategy, MultiGarmentStrategy):
//   1. Create a new file in this directory implementing RenderingStrategy.
//   2. Register it in render-orchestrator.ts.
//   3. This interface file is not modified.
// ---------------------------------------------------------------------------

import type { OrchestratorContext, StrategyResult } from "../types";

/**
 * A rendering strategy encapsulates a complete rendering approach.
 *
 * canHandle   — returns true if this strategy can render the given context.
 *               The orchestrator calls this in priority order and uses the
 *               first strategy that returns true. canHandle must be fast
 *               and synchronous (no I/O).
 *
 * execute     — executes the strategy and returns a StrategyResult.
 *               May throw on unrecoverable failure; the orchestrator will
 *               then try the next eligible strategy.
 */
export interface RenderingStrategy {
  /** Human-readable name for logging, diagnostics, and strategy tracking. */
  readonly name: string;

  /**
   * Returns true if this strategy is capable of handling the given context.
   * Must be synchronous and complete in < 1 ms (no external calls).
   */
  canHandle(context: OrchestratorContext): boolean;

  /**
   * Executes the strategy.
   * Throws on failure; the orchestrator handles fallback.
   * Must never call the Intelligence Engine or modify OrchestratorContext.
   */
  execute(context: OrchestratorContext): Promise<StrategyResult>;
}
