/**
 * DDD file operations via Supabase Storage (Lovable Cloud).
 * Used when VITE_API_BASE_URL is not set (preview / cloud mode).
 * Falls back to TachoWebApi when API_BASE is configured.
 */
import { supabase } from "@/integrations/supabase/client";
import JSZip from "jszip";
import {
  apiListDddFiles,
  apiDownloadDddFile,
  apiDownloadDddZip,
  type DddFileInfo,
} from "@/lib/api-client";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";
const useApi = !!API_BASE;

const DRIVER_CARD_PATTERNS = ["driver1", "driver2", "drivercard"];

function hasDriverCard(files: DddFileInfo[]): boolean {
  return files.some((f) =>
    DRIVER_CARD_PATTERNS.some((p) => f.name.toLowerCase().includes(p))
  );
}

// ── List DDD files ────────────────────────────────────────────

export async function listDddFiles(
  imei: string,
  after: string,
  before: string
): Promise<DddFileInfo[]> {
  if (useApi) return apiListDddFiles(imei, after, before);

  const cloudFiles = await listCloudFiles(imei);

  // If Cloud is missing driver cards and VPS API is available, supplement
  if (!hasDriverCard(cloudFiles) && API_BASE) {
    try {
      const vpsFiles = await apiListDddFiles(imei, after, before);
      const vpsDriverCards = vpsFiles.filter((f) =>
        DRIVER_CARD_PATTERNS.some((p) => f.name.toLowerCase().includes(p))
      );
      if (vpsDriverCards.length > 0) {
        return [...cloudFiles, ...vpsDriverCards];
      }
    } catch {
      // VPS not reachable, continue with cloud-only files
    }
  }

  return cloudFiles;
}

async function listCloudFiles(imei: string): Promise<DddFileInfo[]> {
  const { data, error } = await supabase.storage
    .from("ddd-files")
    .list(imei, { sortBy: { column: "name", order: "asc" } });

  if (error) throw new Error(error.message);
  if (!data) return [];

  return data
    .filter((f) => f.name.endsWith(".ddd"))
    .map((f) => ({
      name: f.name,
      size: ((f.metadata as Record<string, unknown>)?.size as number) ?? 0,
      modified_at: f.updated_at ?? "",
      source: "cloud" as const,
    }));
}

// ── Download single DDD file ──────────────────────────────────

export async function downloadDddFile(
  imei: string,
  fileName: string,
  source?: "cloud" | "vps"
): Promise<ArrayBuffer> {
  // If explicitly VPS or useApi-only mode
  if (source === "vps" || (useApi && source !== "cloud")) {
    return apiDownloadDddFile(imei, fileName);
  }

  const { data, error } = await supabase.storage
    .from("ddd-files")
    .download(`${imei}/${fileName}`);

  if (error) throw new Error(error.message);
  return data.arrayBuffer();
}

// ── Download all matching files as ZIP ────────────────────────

export async function downloadDddZip(
  imei: string,
  after: string,
  before: string
): Promise<ArrayBuffer> {
  if (useApi && !import.meta.env.VITE_SUPABASE_URL) {
    return apiDownloadDddZip(imei, after, before);
  }

  const files = await listDddFiles(imei, after, before);
  if (files.length === 0) throw new Error("Brak plików DDD");

  const zip = new JSZip();

  for (const f of files) {
    // Files from VPS (driver cards) have source marker from listDddFiles
    const fileWithSource = f as DddFileInfo & { source?: string };
    const source = fileWithSource.source === "cloud" ? "cloud" : "vps";
    const buf = await downloadDddFile(imei, f.name, source);
    if (buf.byteLength > 0) {
      zip.file(f.name, buf);
    }
  }

  const blob = await zip.generateAsync({ type: "arraybuffer" });
  return blob;
}
