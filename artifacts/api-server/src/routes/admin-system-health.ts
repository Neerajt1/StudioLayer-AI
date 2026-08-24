import type { Request, Response } from "express";
import { pool } from "@workspace/db";
import { probeR2StorageHealth } from "../lib/r2-config.js";
import {
  aggregateOverallHealthStatus,
  type AdminHealthStatus,
} from "../services/admin-system-health-status.js";

export interface AdminSystemHealthComponent {
  key: "api" | "database" | "storage" | "aiGeneration";
  label: string;
  status: AdminHealthStatus;
  detail: string;
}

async function probeDatabaseHealth(): Promise<AdminSystemHealthComponent> {
  try {
    await pool.query("SELECT 1");
    return {
      key: "database",
      label: "Database",
      status: "healthy",
      detail: "PostgreSQL connection OK",
    };
  } catch {
    return {
      key: "database",
      label: "Database",
      status: "down",
      detail: "PostgreSQL connection failed",
    };
  }
}

async function probeStorageHealth(): Promise<AdminSystemHealthComponent> {
  const probe = await probeR2StorageHealth();
  return {
    key: "storage",
    label: "Storage",
    status: probe.status,
    detail: probe.detail,
  };
}

function probeApiHealth(): AdminSystemHealthComponent {
  return {
    key: "api",
    label: "API",
    status: "healthy",
    detail: "Admin API responding",
  };
}

function probeAiGenerationHealth(): AdminSystemHealthComponent {
  return {
    key: "aiGeneration",
    label: "AI Generation Service",
    status: "not_monitored",
    detail: "No internal generation health probe yet",
  };
}

/** GET /api/admin/system-health */
export async function getAdminSystemHealth(
  _req: Request,
  res: Response,
): Promise<void> {
  const checkedAt = new Date();

  const [database, storage] = await Promise.all([
    probeDatabaseHealth(),
    probeStorageHealth(),
  ]);

  const api = probeApiHealth();
  const aiGeneration = probeAiGenerationHealth();

  const components = [api, database, storage, aiGeneration];
  const overallStatus = aggregateOverallHealthStatus(
    components.map((component) => component.status),
  );

  res.json({
    checkedAt,
    overallStatus,
    components,
  });
}
