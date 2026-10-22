import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export const XERO_BANKING_BUCKET = "xero-banking-confirmations";
export const KADEN_STAFF_PROFILE_ID = "e8598359-54a0-4e1f-a635-1ec8ae02cb78";
export const WAGHEEDA_STAFF_PROFILE_ID = "6ae026bc-8815-4fea-b56c-b2103eb0c093";
export const bankingDocumentManagerIds = new Set([KADEN_STAFF_PROFILE_ID, WAGHEEDA_STAFF_PROFILE_ID]);
export const maximumBankingDocumentBytes = 8 * 1024 * 1024;

export function canReplaceBankingDocument(staffProfileId: string) {
  return bankingDocumentManagerIds.has(staffProfileId);
}

export function validateBankingPdf(bytes: Buffer, mimeType: string) {
  if (mimeType !== "application/pdf") throw new Error("Choose a PDF document.");
  if (!bytes.length || bytes.length > maximumBankingDocumentBytes) throw new Error("The PDF must be smaller than 8 MB.");
  if (bytes.subarray(0, 5).toString("ascii") !== "%PDF-") throw new Error("The file content is not a valid PDF.");
  return createHash("sha256").update(bytes).digest("hex");
}

export async function loadActiveBankingDocument(client: SupabaseClient) {
  const { data: pointer, error: pointerError } = await client
    .from("xero_active_banking_document")
    .select("document_id,activated_at")
    .eq("singleton", true)
    .maybeSingle();
  if (pointerError) throw pointerError;
  if (!pointer) return null;
  const { data, error } = await client
    .from("xero_banking_documents")
    .select("id,version,storage_path,original_filename,file_size,sha256,uploaded_at,uploaded_by_staff_profile_id")
    .eq("id", pointer.document_id)
    .single();
  if (error) throw error;
  return { ...data, activated_at: pointer.activated_at };
}

export async function downloadBankingDocument(client: SupabaseClient, storagePath: string) {
  const { data, error } = await client.storage.from(XERO_BANKING_BUCKET).download(storagePath);
  if (error || !data) throw error ?? new Error("The banking confirmation could not be loaded.");
  return Buffer.from(await data.arrayBuffer());
}
