import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, BUCKET_NAME } from '@/lib/supabase';

// ─── DELETE /api/documents/[id] ─────────────────────────────────────────────
// Deletes a file from Supabase Storage by its storage path (URL-encoded).
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const storagePath = decodeURIComponent(id);

  const { error } = await supabaseAdmin.storage
    .from(BUCKET_NAME)
    .remove([storagePath]);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ message: 'File deleted successfully', path: storagePath });
}

// ─── GET /api/documents/[id] ─────────────────────────────────────────────────
// Returns a short-lived signed URL (1 hour) for the given storage path.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const storagePath = decodeURIComponent(id);

  const { data, error } = await supabaseAdmin.storage
    .from(BUCKET_NAME)
    .createSignedUrl(storagePath, 3600); // 1 hour

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? 'Unknown error' }, { status: 500 });
  }

  return NextResponse.json({ url: data.signedUrl });
}
