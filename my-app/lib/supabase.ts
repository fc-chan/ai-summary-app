import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY!;

export const BUCKET_NAME = process.env.SUPABASE_BUCKET_NAME!;

/** Public client – for reads that respect RLS */
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/** Admin client – bypasses RLS for server-side mutations */
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
