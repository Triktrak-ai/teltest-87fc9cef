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

// ── List DDD files ────────────────────────────────────────────

export async function listDddFiles(
  imei: string,
  after: string,
  before: string
): Promise<DddFileInfo[]> {
  if (useApi) return apiListDddFiles(imei, after, before);

  const { data, error } = await supabase.storage
    .from("ddd-files")
    .list(imei, { sortBy: { column: "name", order: "asc" } });

  if (error) throw new Error(error.message);
  if (!data) return [];

  // In cloud storage mode, return all .ddd files for the IMEI folder.
  // Time-window filtering is only relevant on the VPS backend where
  // file timestamps match download times; in storage, upload times differ.
  return data
    .filter((f) => f.name.endsWith(".ddd"))
    .map((f) => ({
      name: f.name,
      size: (f.metadata as Record<string, unknown>)?.size as number ?? 0,
      modified_at: f.updated_at ?? "",
    }));
}

// ── Download single DDD file ──────────────────────────────────

export async function downloadDddFile(
  imei: string,
  fileName: string
): Promise<ArrayBuffer> {
  if (useApi) return apiDownloadDddFile(imei, fileName);

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
  if (useApi) return apiDownloadDddZip(imei, after, before);

  const files = await listDddFiles(imei, after, before);
  if (files.length === 0) throw new Error("Brak plików DDD");

  const zip = new JSZip();

  for (const f of files) {
    const buf = await downloadDddFile(imei, f.name);
    zip.file(f.name, buf);
  }

  const blob = await zip.generateAsync({ type: "arraybuffer" });
  return blob;
}
