import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

export const BUCKET_NAME = process.env.SUPABASE_BUCKET_NAME ?? '';

const MISSING = [
  !supabaseUrl && 'SUPABASE_URL',
  !supabaseAnonKey && 'SUPABASE_ANON_KEY',
  !supabaseServiceKey && 'SUPABASE_SERVICE_KEY',
  !process.env.SUPABASE_BUCKET_NAME && 'SUPABASE_BUCKET_NAME',
].filter(Boolean);

if (MISSING.length > 0) {
  // Surface a clear error in Vercel / server logs instead of a cryptic crash
  console.error(`[supabase] Missing environment variables: ${MISSING.join(', ')}`);
}

/** Public client – for reads that respect RLS */
export const supabase = createClient(supabaseUrl ?? '', supabaseAnonKey ?? '');

/** Admin client – bypasses RLS for server-side mutations */
export const supabaseAdmin = createClient(supabaseUrl ?? '', supabaseServiceKey ?? '');
