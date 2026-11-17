// Shared by API routes and the browser. No server-only imports here.

/** Private Supabase Storage bucket for IB reports and project documents. Created in supabase/schema.sql. */
export const DOCUMENTS_BUCKET = 'documents';

/** Supabase free plan default upload limit. */
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
